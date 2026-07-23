import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { retryFailedRecipients, getAnnouncementProgress } from "@/lib/announcements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// POST /api/cause-announcements/[id]/retry — requeue every FAILED recipient back
// to PENDING so the normal batch driver picks them up again. Does NOT send here;
// the panel's driver loop handles the actual re-send. Already-SENT recipients are
// untouched, so this never re-emails someone marked delivered.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const { id } = await params;
  try {
    const requeued = await retryFailedRecipients(id);
    const progress = await getAnnouncementProgress(id);
    return NextResponse.json({ ok: true, requeued, announcement: progress });
  } catch (e) {
    console.error("[cause-announcements/retry]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Retry failed." }, { status: 500 });
  }
}
