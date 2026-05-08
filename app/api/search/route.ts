import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public search — title / summary / slug only. PUBLISHED + CLOSED causes (DRAFT hidden).
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  if (!q || q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  try {
    const rows = await prisma.cause.findMany({
      where: {
        status: { in: ["PUBLISHED", "CLOSED"] },
        OR: [
          { title:   { contains: q, mode: "insensitive" } },
          { summary: { contains: q, mode: "insensitive" } },
          { slug:    { contains: q, mode: "insensitive" } },
        ],
      },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      take: 20,
      select: {
        slug: true, title: true, summary: true,
        featuredImage: true, status: true,
        raisedAmount: true, goalAmount: true,
      },
    });

    return NextResponse.json({
      results: rows.map((r) => ({
        slug: r.slug,
        title: r.title,
        summary: r.summary ?? "",
        image: r.featuredImage ?? "",
        status: r.status === "PUBLISHED" ? "active" : "closed",
        raised: r.raisedAmount,
        goal: r.goalAmount,
      })),
    });
  } catch (e) {
    console.error("[search]", e);
    return NextResponse.json({ results: [], error: "Search unavailable" }, { status: 500 });
  }
}
