import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { processNextBatch, sentTodayCount, ANNOUNCEMENT_DAILY_LIMIT } from "@/lib/announcements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/cause-announcements/cron — invoked by the Vercel daily cron (see
// vercel.json). Drains the next daily batch (up to ANNOUNCEMENT_DAILY_LIMIT total)
// across every in-progress announcement, so a >limit send finishes over several
// days without anyone keeping a browser tab open.
//
// Auth: Vercel automatically sends `Authorization: Bearer $CRON_SECRET` on cron
// invocations when CRON_SECRET is set. We require it so the endpoint isn't public.
export async function GET() {
  const h = await headers();
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 503 });
  }
  if (h.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("host") ?? "www.microcharity.com";
  const origin = `${proto}://${host}`;

  // Oldest in-progress announcements first, so an earlier send finishes before a
  // later one starts eating the daily quota.
  const active = await prisma.causeAnnouncement.findMany({
    where: { status: { in: ["PENDING", "SENDING"] } },
    orderBy: { startedAt: "asc" },
    select: { id: true },
  });

  const results: { id: string; sent: number; pending: number; status: string }[] = [];
  for (const a of active) {
    // Stop once the day's quota is spent — further calls would send nothing.
    if ((await sentTodayCount()) >= ANNOUNCEMENT_DAILY_LIMIT) break;
    const before = await sentTodayCount();
    const progress = await processNextBatch(a.id, { origin });
    const after = await sentTodayCount();
    results.push({ id: a.id, sent: after - before, pending: progress.pendingCount, status: progress.status });
  }

  const sentToday = await sentTodayCount();
  return NextResponse.json({
    ok: true,
    dailyLimit: ANNOUNCEMENT_DAILY_LIMIT,
    sentToday,
    announcementsProcessed: results.length,
    results,
  });
}
