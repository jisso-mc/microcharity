import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { decryptPiiSafe } from "@/lib/crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/donors/[id]
//
// Full donor profile (with decrypted PAN) for auto-filling the manual donation
// form. The donor picker on that page ships only non-sensitive fields for the
// whole list; PAN is fetched here one donor at a time, on selection.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const donor = await prisma.donor.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, name: true, email: true, phone: true, address: true, panEncrypted: true },
  });
  if (!donor) return NextResponse.json({ error: "Donor not found" }, { status: 404 });

  const { panEncrypted, ...rest } = donor;
  return NextResponse.json(
    { ...rest, pan: decryptPiiSafe(panEncrypted) || null },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
