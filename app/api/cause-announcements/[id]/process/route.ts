import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { processNextBatch, ANNOUNCEMENT_PROGRESS_SELECT } from "@/lib/announcements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 60s is the hobby plan's hard ceiling for Node.js functions. A batch of 50 emails
// at ~700ms each (Gmail SMTP + 200ms pause) is ~35-45s — comfortably inside.
export const maxDuration = 60;

// POST /api/cause-announcements/[id]/process — drains the next BATCH_SIZE PENDING
// recipients. Idempotent on COMPLETED announcements (returns the current state).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const { id } = await params;

  // Derive the origin from the request so the email links resolve to the right host
  // (preview deployments, custom domains, local dev all just work).
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("host") ?? "microcharity.com";
  const origin = `${proto}://${host}`;

  try {
    await processNextBatch(id, { origin });
    const after = await prisma.causeAnnouncement.findUniqueOrThrow({
      where: { id },
      select: ANNOUNCEMENT_PROGRESS_SELECT,
    });
    return NextResponse.json({
      ok: true,
      announcement: {
        id: after.id,
        subject: after.subject,
        totalRecipients: after.totalRecipients,
        successCount: after.successCount,
        failureCount: after.failureCount,
        status: after.status,
        startedAt: after.startedAt.toISOString(),
        completedAt: after.completedAt?.toISOString() ?? null,
      },
    });
  } catch (e) {
    console.error("[cause-announcements/process]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Batch failed." }, { status: 500 });
  }
}
