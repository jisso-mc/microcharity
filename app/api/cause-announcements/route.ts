import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { createAnnouncement, ANNOUNCEMENT_PROGRESS_SELECT } from "@/lib/announcements";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// POST /api/cause-announcements — kicks off a new send for a cause. Snapshots the
// current opted-in donor list into AnnouncementRecipient rows; the actual sending
// happens batch-by-batch via /api/cause-announcements/[id]/process.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const form = await req.formData();
  const causeId = String(form.get("causeId") ?? "").trim();
  if (!causeId) return NextResponse.json({ error: "Missing causeId." }, { status: 400 });

  const cause = await prisma.cause.findUnique({
    where: { id: causeId },
    select: { id: true, title: true, status: true },
  });
  if (!cause) return NextResponse.json({ error: "Cause not found." }, { status: 404 });
  if (cause.status !== "PUBLISHED") {
    return NextResponse.json({ error: "Publish the cause before announcing it." }, { status: 400 });
  }

  try {
    const { id, totalRecipients } = await createAnnouncement({
      causeId: cause.id,
      subject: `MicroCharity announces support for a new cause: ${cause.title}`,
      sentByUserId: await safeUserId(user.userId),
    });

    await audit({
      action: "announcement.send.start",
      userId: user.userId,
      entityType: "CauseAnnouncement",
      entityId: id,
      payload: { causeId: cause.id, totalRecipients },
    });

    const fresh = await prisma.causeAnnouncement.findUniqueOrThrow({
      where: { id }, select: ANNOUNCEMENT_PROGRESS_SELECT,
    });
    return NextResponse.json({ ok: true, announcement: serialize(fresh) });
  } catch (e) {
    console.error("[cause-announcements]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not start." }, { status: 500 });
  }
}

async function safeUserId(userId: string): Promise<string | null> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  return u?.id ?? null;
}

// Cast Date → string ISO for JSON.
function serialize(row: {
  id: string;
  subject: string;
  totalRecipients: number;
  successCount: number;
  failureCount: number;
  status: "PENDING" | "SENDING" | "COMPLETED" | "CANCELLED";
  startedAt: Date;
  completedAt: Date | null;
}) {
  return {
    id: row.id,
    subject: row.subject,
    totalRecipients: row.totalRecipients,
    successCount: row.successCount,
    failureCount: row.failureCount,
    status: row.status,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

