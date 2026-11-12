import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  validateSubmission, verifyAttachments, verifyApplicationEditToken, APPLICANT_EDITABLE_STATUSES,
  type AttachmentMeta,
} from "@/lib/applications";
import { sendApplicationToAdmin } from "@/lib/email";
import { deleteAttachments } from "@/lib/application-attachments";
import { rateLimit, callerIp, LIMITS } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// PUT /api/cause-applications/edit/[token]
//
// Saves changes an applicant makes through the link an admin copied from
// /admin/forms/[id]. Same JSON shape as the original submission (payload +
// attachments); the form type can't change. Files the applicant replaced or
// removed are deleted from Blob after the save.
export async function PUT(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const rl = await rateLimit(LIMITS.applicationEdit, callerIp(req));
    if (!rl.ok) {
      return NextResponse.json(
        { error: "Too many saves from your network. Please try again in a while." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } },
      );
    }

    const { token } = await params;
    const id = verifyApplicationEditToken(token);
    if (!id) return NextResponse.json({ error: "This link is not valid." }, { status: 404 });

    const app = await prisma.causeApplication.findUnique({ where: { id } });
    if (!app) return NextResponse.json({ error: "This link is not valid." }, { status: 404 });
    if (!APPLICANT_EDITABLE_STATUSES.includes(app.status)) {
      return NextResponse.json({ error: "This application can no longer be edited. Please contact MicroCharity." }, { status: 409 });
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: "Bad request." }, { status: 400 });

    const v = validateSubmission(app.formType, body.payload);
    if (!v.ok) return NextResponse.json({ error: v.errors.join(" ") }, { status: 400 });

    const existing = (app.attachmentMeta as AttachmentMeta[] | null) ?? [];
    const att = await verifyAttachments(app.formType, body.attachments, existing);
    if (!att.ok) return NextResponse.json({ error: att.error }, { status: 400 });

    await prisma.causeApplication.update({
      where: { id },
      data: {
        fullName: v.fullName,
        phone: v.phone,
        email: v.email,
        data: v.data as never,
        attachmentMeta: att.meta as never,
      },
    });

    // Clean up files that were replaced / removed in this edit.
    const kept = new Set(att.meta.map((a) => a.url));
    await deleteAttachments(existing.filter((a) => a.url && !kept.has(a.url)));

    await audit({
      action: "application.update.applicant",
      userId: null,
      entityType: "CauseApplication",
      entityId: id,
      payload: { attachments: att.meta.length },
    });

    try {
      await sendApplicationToAdmin({
        kind: "updated",
        applicationNo: app.applicationNo,
        formType: app.formType,
        data: v.data as Record<string, unknown>,
        applicantName: v.fullName,
        applicantEmail: v.email,
        applicantPhone: v.phone,
        attachmentMeta: att.meta,
        submittedAt: app.createdAt,
        adminUrl: new URL(`/admin/forms/${id}`, req.url).toString(),
      });
    } catch (e) {
      console.error("[cause-applications/edit] admin notification failed", e);
    }

    return NextResponse.json({ ok: true, applicationNo: app.applicationNo });
  } catch (e) {
    console.error("[cause-applications/edit]", e);
    return NextResponse.json({ error: "Could not save your changes. Please try again." }, { status: 500 });
  }
}
