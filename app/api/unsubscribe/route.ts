import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyUnsubscribeToken } from "@/lib/announcements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/unsubscribe — confirms an unsubscribe action. Requires the HMAC token
// to match the email; without it anyone could unsubscribe anyone by guessing addresses.
export async function POST(req: Request) {
  const form = await req.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const token = String(form.get("token") ?? "").trim();

  if (!email || !token || !verifyUnsubscribeToken(email, token)) {
    return NextResponse.json({ error: "Invalid unsubscribe link." }, { status: 400 });
  }

  // Update the Donor row (if any) and add to the global unsubscribe list. We keep
  // both because some recipients won't have a Donor row yet (forwarded mail etc.),
  // and the UnsubscribeList is the source of truth for "never email this address".
  const donor = await prisma.donor.findUnique({ where: { email }, select: { id: true } });
  if (donor) {
    await prisma.donor.update({ where: { id: donor.id }, data: { unsubscribed: true } });
  }
  await prisma.unsubscribeList.upsert({
    where: { email },
    create: { email, reason: "user-clicked-link" },
    update: {},
  });

  return NextResponse.json({ ok: true });
}
