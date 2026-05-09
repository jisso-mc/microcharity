import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin-only cause search — used by the "duplicate from" picker on the new-cause form.
// Includes DRAFT causes and returns enough data to surface dates so the admin can tell
// older campaigns apart for the same beneficiary.
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ results: [] });

  const rows = await prisma.cause.findMany({
    where: {
      OR: [
        { title:          { contains: q, mode: "insensitive" } },
        { slug:           { contains: q, mode: "insensitive" } },
        { beneficiaryKey: { contains: q, mode: "insensitive" } },
      ],
    },
    orderBy: [{ updatedAt: "desc" }],
    take: 20,
    select: {
      slug: true,
      title: true,
      status: true,
      mcId: true,
      startDate: true,
      createdAt: true,
      beneficiaryKey: true,
      _count: { select: { updates: true } },
    },
  });

  return NextResponse.json({
    results: rows.map((r) => ({
      slug: r.slug,
      title: r.title,
      status: r.status,
      mcId: r.mcId,
      beneficiaryKey: r.beneficiaryKey,
      updateCount: r._count.updates,
      // Both dates exposed so the picker can show whichever is most informative.
      startDate: r.startDate?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
  });
}
