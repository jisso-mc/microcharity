import { NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { createUnverifiedDonation } from "@/lib/donations";
import { sendDonationAck } from "@/lib/email";
import { parseDonorPayload } from "@/lib/donate-input";
import { rateLimit, callerIp, LIMITS } from "@/lib/rate-limit";
import { uploadToBlob } from "@/lib/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Donor-facing offline donation submission.
// - Multipart: donor fields + an optional payment screenshot.
// - Persists a PENDING donation (admin approves later) with screenshot URL.
// - Sends an acknowledgment email immediately (per spec).
// - 80G receipt is sent only after admin approval — wired in approveDonationAction.
export async function POST(req: Request) {
  try {
    const rl = await rateLimit(LIMITS.donateOffline, callerIp(req));
    if (!rl.ok) {
      return NextResponse.json(
        { error: "Too many requests. Please wait a moment and try again." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } }
      );
    }

    const form = await req.formData();
    const parsed = parseDonorPayload(formDataToRecord(form));
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const cause = await prisma.cause.findUnique({
      where: { slug: parsed.slug },
      select: { id: true, slug: true, title: true, status: true, enableOffline: true },
    });
    if (!cause)                       return NextResponse.json({ error: "Cause not found." }, { status: 404 });
    if (cause.status !== "PUBLISHED") return NextResponse.json({ error: "This cause is not accepting donations." }, { status: 400 });
    if (cause.enableOffline === false) return NextResponse.json({ error: "Offline donations are disabled for this cause." }, { status: 400 });

    const donation = await createUnverifiedDonation({
      causeId: cause.id,
      donorName: parsed.name,
      donorEmail: parsed.email,
      donorPhone: parsed.phone,
      donorPan: parsed.pan,
      donorAddress: parsed.address,
      amount: parsed.amount,
      type: "OFFLINE",
      paymentReference: parsed.reference,
      paymentDate: parsed.paymentDate,
    });

    const screenshot = form.get("screenshot");
    const hasScreenshot = screenshot instanceof File && screenshot.size > 0;

    // Defer the two slow ops (Blob upload, SMTP send) so the donor's response
    // returns immediately. Both are non-critical for the donor flow — the row is
    // already saved and admin can resend the ack if SMTP hiccups.
    after(async () => {
      if (hasScreenshot) {
        try {
          const result = await uploadToBlob({
            file: screenshot,
            pathPrefix: `donations/${donation.id}`,
            slot: "screenshot",
          });
          await prisma.donation.update({
            where: { id: donation.id },
            data: {
              attachmentUrl: result.url,
              attachmentMeta: { filename: result.filename, size: result.size, mimeType: result.mimeType } as never,
            },
          });
        } catch (e) {
          console.error("[donate/offline] screenshot upload failed (background)", e);
        }
      }
      try {
        await sendDonationAck({
          donorName: parsed.name,
          donorEmail: parsed.email,
          causeTitle: cause.title,
          donationDate: donation.createdAt,
          amount: parsed.amount,
          paymentMethod: "Offline Donation",
          paymentId: donation.id.slice(-8).toUpperCase(),
        });
      } catch (e) {
        console.error("[donate/offline] ack email failed (background)", e);
      }
    });

    return NextResponse.json({ ok: true, donationId: donation.id });
  } catch (e) {
    console.error("[donate/offline]", e);
    return NextResponse.json({ error: "Could not submit donation. Please try again." }, { status: 500 });
  }
}

// Pull the donor-form text fields out of multipart into the shape parseDonorPayload
// expects (it predates the screenshot feature, hence the JSON-record signature).
function formDataToRecord(form: FormData): Record<string, unknown> {
  return {
    slug:    form.get("slug"),
    amount:  form.get("amount"),
    name:    form.get("name"),
    phone:   form.get("phone"),
    email:   form.get("email"),
    pan:     form.get("pan"),
    address: form.get("address"),
  };
}
