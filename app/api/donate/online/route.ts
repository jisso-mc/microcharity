import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { razorpay, razorpayKeyId, isRazorpayConfigured } from "@/lib/razorpay";
import { createOnlineDonationOrder } from "@/lib/donations";
import { rateLimit, callerIp, LIMITS } from "@/lib/rate-limit";
import { normalizePan } from "@/lib/donate-input";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Creates a Razorpay order, persists a PENDING donation row, and returns what the
// browser needs to open Razorpay Checkout (key id + order id + display values).
export async function POST(req: Request) {
  try {
    const rl = await rateLimit(LIMITS.donateOnline, callerIp(req));
    if (!rl.ok) {
      return NextResponse.json(
        { error: "Too many requests. Please wait a moment and try again." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } }
      );
    }

    if (!isRazorpayConfigured()) {
      return NextResponse.json({ error: "Online donations are not configured yet." }, { status: 503 });
    }

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const slug   = String(body.slug ?? "").trim();
    const amount = Number(body.amount);
    const name   = String(body.name ?? "").trim();
    const email  = String(body.email ?? "").trim().toLowerCase();
    const phone  = String(body.phone ?? "").trim();
    const pan    = normalizePan(body.pan);

    if (!slug)                   return NextResponse.json({ error: "Cause is required." }, { status: 400 });
    if (!Number.isFinite(amount) || amount < 100) {
      return NextResponse.json({ error: "Minimum donation is ₹100." }, { status: 400 });
    }
    if (!name)                   return NextResponse.json({ error: "Your name is required." }, { status: 400 });
    if (!phone)                  return NextResponse.json({ error: "Phone is required." }, { status: 400 });
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return NextResponse.json({ error: "A valid email is required for the receipt." }, { status: 400 });
    }
    if (!pan) return NextResponse.json({ error: "A valid PAN is required (10 characters, e.g. ABCDE1234F)." }, { status: 400 });

    const cause = await prisma.cause.findUnique({
      where: { slug },
      select: { id: true, slug: true, title: true, status: true, enableOnline: true },
    });
    if (!cause)                          return NextResponse.json({ error: "Cause not found." }, { status: 404 });
    if (cause.status !== "PUBLISHED")    return NextResponse.json({ error: "This cause is not accepting donations." }, { status: 400 });
    if (cause.enableOnline === false)    return NextResponse.json({ error: "Online donations are disabled for this cause." }, { status: 400 });

    const amountInPaise = Math.round(amount * 100);

    const order = await razorpay().orders.create({
      amount: amountInPaise,
      currency: "INR",
      // Receipt is for Razorpay's books — must be ≤40 chars. Slug truncated; donation id added after creation isn't possible since order comes first.
      receipt: `mch-${cause.slug.slice(0, 30)}-${Date.now().toString().slice(-6)}`,
      notes: {
        cause_slug: cause.slug,
        cause_title: cause.title,
        donor_name: name,
        donor_email: email,
      },
    });

    await createOnlineDonationOrder({
      causeId: cause.id,
      donorName: name,
      donorEmail: email,
      donorPhone: phone,
      donorPan: pan,
      amount: Math.round(amount),
      razorpayOrderId: order.id,
    });

    return NextResponse.json({
      ok: true,
      orderId: order.id,
      keyId: razorpayKeyId(),
      amount: amountInPaise,
      currency: "INR",
      causeTitle: cause.title,
      prefill: { name, email, contact: phone },
    });
  } catch (e) {
    console.error("[donate/online]", e);
    return NextResponse.json({ error: "Could not start payment. Please try again." }, { status: 500 });
  }
}
