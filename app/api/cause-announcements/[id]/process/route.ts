import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getCurrentUser } from "@/lib/session";
import { processNextBatch, getAnnouncementProgress, getFailureSummary } from "@/lib/announcements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 60s is the hobby plan's hard ceiling for Node.js functions. The batch loop is
// time-boxed to BATCH_TIME_BUDGET_MS (40s), so it always returns on its own terms
// — well inside this — and the client therefore always receives valid JSON.
export const maxDuration = 60;

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (user.role !== "ADMIN") return { error: NextResponse.json({ error: "Admins only" }, { status: 403 }) };
  return { user };
}

// GET /api/cause-announcements/[id]/process — read-only progress with reconciled
// (true) counts. The panel polls this every few seconds so the status readout is
// always live, independent of whether a send batch is currently running.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const { id } = await params;
  try {
    const progress = await getAnnouncementProgress(id);
    if (!progress) return NextResponse.json({ error: "Announcement not found." }, { status: 404 });
    // Include a grouped breakdown of failure reasons so the admin can see WHY
    // sends failed. Only queried when there are failures to report.
    const failures = progress.failureCount > 0 ? await getFailureSummary(id) : [];
    return NextResponse.json({ ok: true, announcement: progress, failures });
  } catch (e) {
    console.error("[cause-announcements/process GET]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not read status." }, { status: 500 });
  }
}

// POST /api/cause-announcements/[id]/process — sends the next time-boxed batch of
// PENDING recipients, then returns reconciled progress. Safe to call repeatedly:
// already-sent recipients are never re-selected. Always responds with JSON.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const { id } = await params;

  // Derive the origin from the request so the email links resolve to the right host
  // (preview deployments, custom domains, local dev all just work).
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("host") ?? "microcharity.com";
  const origin = `${proto}://${host}`;

  try {
    const progress = await processNextBatch(id, { origin });
    const failures = progress.failureCount > 0 ? await getFailureSummary(id) : [];
    return NextResponse.json({ ok: true, announcement: progress, failures });
  } catch (e) {
    console.error("[cause-announcements/process POST]", e);
    // Even on failure, try to hand back the current progress so the UI can keep
    // showing accurate numbers and decide whether to retry.
    let progress = null;
    try { progress = await getAnnouncementProgress(id); } catch { /* ignore */ }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Batch failed.", announcement: progress },
      { status: 500 }
    );
  }
}
