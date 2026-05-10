import { NextResponse } from "next/server";
import type { ApplicationFormType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  validateSubmission,
  nextApplicationNo,
  ATTACHMENT_RULES,
  ATTACHMENT_TOTAL_MAX,
  type AttachmentMeta,
} from "@/lib/applications";
import { sendApplicationToAdmin, sendApplicationConfirmation, type EmailAttachment } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public submission endpoint for /cause-applications.
//
// Request: multipart/form-data with:
//   formType: "EDUCATIONAL" | "MEDICAL" | "INDIVIDUAL" | "ORGANIZATIONAL"
//   payload:  JSON-stringified per-type payload (see lib/applications.ts)
//   photo, medicalCertificate, referenceLetter, ngoDeclaration: optional File entries
//
// Files are forwarded to info@microcharity.com once and never persisted —
// only their filename/size/mime/slot lands in the DB on the row's `attachmentMeta`.
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const formTypeRaw = String(form.get("formType") ?? "");
    const validTypes: ApplicationFormType[] = ["EDUCATIONAL", "MEDICAL", "INDIVIDUAL", "ORGANIZATIONAL"];
    if (!validTypes.includes(formTypeRaw as ApplicationFormType)) {
      return NextResponse.json({ error: "Pick a form type." }, { status: 400 });
    }
    const formType = formTypeRaw as ApplicationFormType;

    const payloadRaw = form.get("payload");
    if (typeof payloadRaw !== "string") {
      return NextResponse.json({ error: "Missing payload." }, { status: 400 });
    }
    let parsed: unknown;
    try { parsed = JSON.parse(payloadRaw); } catch { return NextResponse.json({ error: "Payload is not valid JSON." }, { status: 400 }); }

    const v = validateSubmission(formType, parsed);
    if (!v.ok) {
      return NextResponse.json({ error: v.errors.join(" ") }, { status: 400 });
    }

    // Read + validate attachments. We only iterate the slots we know about; anything
    // else in the multipart body is ignored.
    const attachmentMeta: AttachmentMeta[] = [];
    const attachments: EmailAttachment[] = [];
    let totalSize = 0;
    for (const field of Object.keys(ATTACHMENT_RULES) as Array<keyof typeof ATTACHMENT_RULES>) {
      const file = form.get(field);
      if (!(file instanceof File) || file.size === 0) continue;
      const rule = ATTACHMENT_RULES[field];
      if (file.size > rule.maxBytes) {
        return NextResponse.json({ error: `${field} exceeds the ${(rule.maxBytes / 1024 / 1024).toFixed(0)} MB limit.` }, { status: 400 });
      }
      if (file.type && !rule.accept.includes(file.type)) {
        return NextResponse.json({ error: `${field}: file type ${file.type} not allowed.` }, { status: 400 });
      }
      totalSize += file.size;
      if (totalSize > ATTACHMENT_TOTAL_MAX) {
        return NextResponse.json({ error: `Attachments combined exceed the ${(ATTACHMENT_TOTAL_MAX / 1024 / 1024).toFixed(0)} MB ceiling.` }, { status: 400 });
      }
      const buf = Buffer.from(await file.arrayBuffer());
      attachments.push({ filename: file.name, content: buf, contentType: file.type });
      attachmentMeta.push({ field, filename: file.name, size: file.size, mimeType: file.type });
    }

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

    const created = await prisma.$transaction(async (tx) => {
      const applicationNo = await nextApplicationNo(tx, formType);
      return tx.causeApplication.create({
        data: {
          applicationNo,
          formType,
          fullName: v.fullName,
          phone: v.phone,
          email: v.email,
          // Cast: Prisma expects a JsonValue; our typed payloads are JSON-safe objects.
          data: v.data as never,
          attachmentMeta: attachmentMeta as never,
          submittedFromIp: ip,
        },
      });
    });

    // Forward to admin (with attachments) — awaited so failures surface to the caller.
    try {
      await sendApplicationToAdmin({
        applicationNo: created.applicationNo,
        formType: created.formType,
        data: v.data as Record<string, unknown>,
        applicantName: v.fullName,
        applicantEmail: v.email,
        applicantPhone: v.phone,
        attachmentMeta,
        attachments,
        submittedAt: created.createdAt,
      });
    } catch (e) {
      console.error("[cause-applications] admin notification failed", e);
      // Don't fail the submission — the row is saved; admin can still see it in /admin/forms.
    }

    // Optional confirmation back to applicant
    if (v.email) {
      try {
        await sendApplicationConfirmation({
          applicationNo: created.applicationNo,
          formType: created.formType,
          applicantName: v.fullName,
          applicantEmail: v.email,
          attachmentMeta,
        });
      } catch (e) {
        console.error("[cause-applications] applicant confirmation failed", e);
      }
    }

    return NextResponse.json({ ok: true, applicationNo: created.applicationNo });
  } catch (e) {
    console.error("[cause-applications]", e);
    return NextResponse.json({ error: "Could not submit application. Please try again." }, { status: 500 });
  }
}
