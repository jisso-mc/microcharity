import { NextResponse } from "next/server";
import type { ApplicationFormType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { validateSubmission, nextApplicationNo, verifyAttachments } from "@/lib/applications";
import { sendApplicationToAdmin, sendApplicationConfirmation } from "@/lib/email";
import { fetchAttachmentsForEmail } from "@/lib/application-attachments";
import { rateLimit, callerIp, LIMITS } from "@/lib/rate-limit";
import { retryOnUniqueViolation } from "@/lib/retry";

// Bot-trap thresholds. The form has 30+ fields across multiple sections; even with
// browser autofill a human takes >2 seconds. Any submission below this is treated
// as bot-driven and silently dropped — we return a generic success so the bot
// can't probe for the threshold by tweaking timings.
const MIN_FILL_MS = 2000;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Public submission endpoint for /cause-applications.
//
// Request: JSON
//   formType:    "EDUCATIONAL" | "MEDICAL" | "INDIVIDUAL" | "ORGANIZATIONAL"
//   payload:     per-type payload (see lib/applications.ts)
//   attachments: [{ field, url, filename }] — files the browser already uploaded to
//                Vercel Blob via /api/cause-applications/upload (each ≤ 2 MB)
//   website, elapsedMs: bot traps
//
// Every attachment URL is re-verified against Blob before it's stored. A copy of the
// files is also attached to the admin notification email as a backup.
export async function POST(req: Request) {
  try {
    const ipForLimits = callerIp(req);
    const rl = await rateLimit(LIMITS.causeApplication, ipForLimits);
    if (!rl.ok) {
      return NextResponse.json(
        { error: "Too many submissions from your network. Please try again in a while." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } }
      );
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: "Bad request." }, { status: 400 });

    // Bot trap — checked before any DB or email work. We answer 200 OK with a
    // fake-looking application number so the bot thinks it succeeded; nothing is
    // persisted, no emails are sent. This avoids leaking the threshold to anyone
    // tuning their bot.
    const honeypot = String(body.website ?? "").trim();
    const elapsedMs = Number(body.elapsedMs ?? 0);
    if (honeypot || !Number.isFinite(elapsedMs) || elapsedMs < MIN_FILL_MS) {
      console.warn("[cause-applications] bot-trap fired", { honeypotFilled: !!honeypot, elapsedMs });
      return NextResponse.json({ ok: true, applicationNo: "MC/PENDING" });
    }
    const formTypeRaw = String(body.formType ?? "");
    const validTypes: ApplicationFormType[] = ["EDUCATIONAL", "MEDICAL", "INDIVIDUAL", "ORGANIZATIONAL"];
    if (!validTypes.includes(formTypeRaw as ApplicationFormType)) {
      return NextResponse.json({ error: "Pick a form type." }, { status: 400 });
    }
    const formType = formTypeRaw as ApplicationFormType;

    const v = validateSubmission(formType, body.payload);
    if (!v.ok) {
      return NextResponse.json({ error: v.errors.join(" ") }, { status: 400 });
    }

    const att = await verifyAttachments(formType, body.attachments);
    if (!att.ok) return NextResponse.json({ error: att.error }, { status: 400 });

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

    // Retry handles the rare race where two simultaneous submissions both pick the
    // same `MC/<TYPE>/<FY>/<seq>` — the @@unique on applicationNo throws P2002 on the
    // loser, the wrapper re-runs with the now-incremented max.
    const created = await retryOnUniqueViolation(() => prisma.$transaction(async (tx) => {
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
          attachmentMeta: att.meta as never,
          submittedFromIp: ip,
        },
      });
    }));

    // Forward to admin (with a copy of the files) — awaited so failures are logged.
    try {
      await sendApplicationToAdmin({
        applicationNo: created.applicationNo,
        formType: created.formType,
        data: v.data as Record<string, unknown>,
        applicantName: v.fullName,
        applicantEmail: v.email,
        applicantPhone: v.phone,
        attachmentMeta: att.meta,
        attachments: await fetchAttachmentsForEmail(formType, att.meta),
        submittedAt: created.createdAt,
        adminUrl: new URL(`/admin/forms/${created.id}`, req.url).toString(),
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
          attachmentMeta: att.meta,
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
