import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createUnverifiedDonation } from "@/lib/donations";
import { sendDonationAck } from "@/lib/email";
import { parseDonorPayload } from "@/lib/donate-input";
import { rateLimit, callerIp, LIMITS } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Donor-facing offline donation submission.
// - Persists a PENDING donation (admin approves later)
// - Sends an acknowledgment email immediately (per spec)
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

    const data = await req.json().catch(() => ({} as Record<string, unknown>));
    const parsed = parseDonorPayload(data);
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

    // Await the ack email — fire-and-forget on Vercel's serverless runtime gets
    // killed when the function response returns, so the email never sends. We catch
    // and log so a transient SMTP failure still returns success to the donor (their
    // donation is already saved; admin can resend if needed).
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
      console.error("[donate/offline] ack email failed", e);
    }

    return NextResponse.json({ ok: true, donationId: donation.id });
  } catch (e) {
    console.error("[donate/offline]", e);
    return NextResponse.json({ error: "Could not submit donation. Please try again." }, { status: 500 });
  }
}

