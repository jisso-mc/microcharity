import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { createAnnouncement, getAnnouncementProgress } from "@/lib/announcements";
import { audit } from "@/lib/audit";
import { TEST_ANNOUNCEMENT_RECIPIENTS } from "@/lib/trust";

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

  // Test sends go to an arbitrary admin-supplied recipient list ("testEmails"
  // form field, comma-separated). Falls back to the trust-defined reviewer
  // list when test=1 is set without explicit emails — keeps existing callers
  // working. When `test` is empty/omitted, the broadcast goes to all opted-in
  // donors and ignores any testEmails supplied.
  const isTest = String(form.get("test") ?? "") === "1";
  const rawTestEmails = String(form.get("testEmails") ?? "").trim();
  let testRecipients: Array<{ name: string; email: string }> | undefined;
  if (isTest) {
    if (rawTestEmails) {
      const emails = Array.from(
        new Set(
          rawTestEmails
            .split(/[,\s;]+/)
            .map((e) => e.trim().toLowerCase())
            .filter(Boolean)
        )
      );
      const bad = emails.filter((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
      if (bad.length) {
        return NextResponse.json({ error: `Invalid email(s): ${bad.join(", ")}` }, { status: 400 });
      }
      if (emails.length === 0) {
        return NextResponse.json({ error: "Add at least one test email." }, { status: 400 });
      }
      testRecipients = emails.map((email) => ({ email, name: email.split("@")[0] ?? email }));
    } else {
      testRecipients = TEST_ANNOUNCEMENT_RECIPIENTS;
    }
  }
  const testSubject = isTest ? `[TEST] ${cause.title}` : `MicroCharity announces support for a new cause: ${cause.title}`;

  try {
    const { id, totalRecipients } = await createAnnouncement({
      causeId: cause.id,
      subject: testSubject,
      sentByUserId: await safeUserId(user.userId),
      testRecipients,
    });

    await audit({
      action: "announcement.send.start",
      userId: user.userId,
      entityType: "CauseAnnouncement",
      entityId: id,
      payload: { causeId: cause.id, totalRecipients, isTest },
    });

    const fresh = await getAnnouncementProgress(id);
    return NextResponse.json({ ok: true, announcement: fresh });
  } catch (e) {
    console.error("[cause-announcements]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not start." }, { status: 500 });
  }
}

async function safeUserId(userId: string): Promise<string | null> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  return u?.id ?? null;
}

