import { NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { createUnverifiedDonation } from "@/lib/donations";
import { sendDonationAck } from "@/lib/email";
import { parseDonorPayload } from "@/lib/donate-input";
import { rateLimit, callerIp, LIMITS } from "@/lib/rate-limit";
import { uploadToBlob } from "@/lib/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Allow the post-response background work (Blob upload + ack email) to finish
// without the function being recycled mid-call. Vercel caps Hobby at 60s.
export const maxDuration = 60;

// Donor-facing UPI / QR code donation submission.
// Multipart: donor fields + an optional payment screenshot. Donor pays out of
// band via UPI, then submits this form. We persist a PENDING donation, store
// the screenshot URL on the row, and email an immediate acknowledgment. 80G
// receipt waits for admin verification.
export async function POST(req: Request) {
  try {
    const rl = await rateLimit(LIMITS.donateQr, callerIp(req));
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
      select: { id: true, slug: true, title: true, status: true },
    });
    if (!cause)                       return NextResponse.json({ error: "Cause not found." }, { status: 404 });
    if (cause.status !== "PUBLISHED") return NextResponse.json({ error: "This cause is not accepting donations." }, { status: 400 });

    const donation = await createUnverifiedDonation({
      causeId: cause.id,
      donorName: parsed.name,
      donorEmail: parsed.email,
      donorPhone: parsed.phone,
      donorPan: parsed.pan,
      donorAddress: parsed.address,
      amount: parsed.amount,
      type: "QR",
    });

    const screenshot = form.get("screenshot");
    const hasScreenshot = screenshot instanceof File && screenshot.size > 0;

    // Defer the two slow ops (Blob upload, SMTP send) to run after the response
    // is sent. The donor sees the "thank you" screen instantly instead of waiting
    // 3-4s. Failures here are logged but never block; the donation row is already
    // persisted, and admin can resend the ack if needed.
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
          console.error("[donate/qr] screenshot upload failed (background)", e);
        }
      }
      try {
        await sendDonationAck({
          donorName: parsed.name,
          donorEmail: parsed.email,
          causeTitle: cause.title,
          donationDate: donation.createdAt,
          amount: parsed.amount,
          paymentMethod: "UPI / QR Code",
          paymentId: donation.id.slice(-8).toUpperCase(),
        });
      } catch (e) {
        console.error("[donate/qr] ack email failed (background)", e);
      }
    });

    return NextResponse.json({ ok: true, donationId: donation.id });
  } catch (e) {
    console.error("[donate/qr]", e);
    return NextResponse.json({ error: "Could not submit donation. Please try again." }, { status: 500 });
  }
}

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
