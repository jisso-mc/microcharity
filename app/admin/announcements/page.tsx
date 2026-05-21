import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Announcements — Admin" };
export const dynamic = "force-dynamic";

// Engagement-rate "grade" — matches the WordPress mailer aesthetic the user
// referenced: small coloured chip alongside each percentage so it's obvious
// at a glance whether a send landed. Thresholds picked to align loosely with
// industry email-engagement benchmarks (open: ~20% baseline; click: ~2.5%).
function gradeOpen(pct: number): { label: string; cls: string } {
  if (pct >= 40) return { label: "Excellent", cls: "bg-emerald-100 text-emerald-800 border-emerald-200" };
  if (pct >= 20) return { label: "Good",      cls: "bg-amber-100 text-amber-800 border-amber-200" };
  return { label: "Low", cls: "bg-rose-100 text-rose-800 border-rose-200" };
}
function gradeClick(pct: number): { label: string; cls: string } {
  if (pct >= 4) return { label: "Excellent", cls: "bg-emerald-100 text-emerald-800 border-emerald-200" };
  if (pct >= 1) return { label: "Good",      cls: "bg-amber-100 text-amber-800 border-amber-200" };
  return { label: "Low", cls: "bg-rose-100 text-rose-800 border-rose-200" };
}

const STATUS_CLS: Record<string, string> = {
  PENDING:   "bg-[var(--color-soft)] text-muted",
  SENDING:   "bg-amber-50 text-amber-700",
  COMPLETED: "bg-accent-50 text-accent-700",
  CANCELLED: "bg-[var(--color-soft)] text-muted",
};

export default async function AnnouncementsAdminPage() {
  const rows = await prisma.causeAnnouncement.findMany({
    orderBy: { startedAt: "desc" },
    select: {
      id: true, subject: true, status: true, isTest: true,
      totalRecipients: true, successCount: true, failureCount: true,
      openCount: true, clickCount: true,
      startedAt: true, completedAt: true,
      cause: { select: { slug: true, title: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl text-ink">Announcements</h1>
        <p className="text-sm text-muted mt-1">
          {rows.length} send{rows.length === 1 ? "" : "s"} across all causes. Opens and clicks
          are tracked per recipient via a pixel and rewritten links.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--color-line)] bg-white p-10 text-center">
          <p className="text-sm text-muted">No announcements sent yet.</p>
        </div>
      ) : (
        <div className="rounded-2xl bg-white border border-[var(--color-line)] overflow-x-auto">
          <table className="w-full text-sm min-w-[1000px]">
            <thead className="bg-[var(--color-soft)] text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="text-left font-semibold px-4 py-3">Subject</th>
                <th className="text-left font-semibold px-3 py-3 w-[8rem]">Status</th>
                <th className="text-right font-semibold px-3 py-3 w-[8rem]">Sent</th>
                <th className="text-left  font-semibold px-3 py-3 w-[12rem]">Opened</th>
                <th className="text-left  font-semibold px-3 py-3 w-[12rem]">Clicked</th>
                <th className="text-left  font-semibold px-3 py-3 w-[10rem]">Started</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const delivered = r.successCount;
                const openPct = delivered > 0 ? Math.round((r.openCount / delivered) * 100 * 10) / 10 : 0;
                const clickPct = delivered > 0 ? Math.round((r.clickCount / delivered) * 100 * 10) / 10 : 0;
                const og = gradeOpen(openPct);
                const cg = gradeClick(clickPct);
                return (
                  <tr key={r.id} className="border-t border-[var(--color-line)] align-top">
                    <td className="px-4 py-3 max-w-[26rem]">
                      <div className="flex items-center gap-2">
                        {r.isTest && (
                          <span className="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-700 whitespace-nowrap">
                            Test
                          </span>
                        )}
                        <Link href={`/admin/causes/${r.cause.slug}`} className="text-ink font-medium truncate hover:text-accent-600" title={r.subject}>
                          {r.subject}
                        </Link>
                      </div>
                      <span className="block text-xs text-muted truncate mt-0.5">{r.cause.title}</span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`text-[11px] uppercase tracking-wider font-semibold px-2 py-1 rounded ${STATUS_CLS[r.status] ?? ""}`}>
                        {r.status.toLowerCase()}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">
                      <span className="block text-ink">{r.successCount} / {r.totalRecipients}</span>
                      {r.failureCount > 0 && <span className="block text-xs text-rose-700">{r.failureCount} failed</span>}
                    </td>
                    <td className="px-3 py-3">
                      {delivered > 0 ? (
                        <div className="flex items-center gap-2">
                          <span className="text-ink tabular-nums">{openPct}%</span>
                          <span className={`text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded border ${og.cls}`}>{og.label}</span>
                          <span className="text-xs text-muted">({r.openCount})</span>
                        </div>
                      ) : <span className="text-xs text-muted">—</span>}
                    </td>
                    <td className="px-3 py-3">
                      {delivered > 0 ? (
                        <div className="flex items-center gap-2">
                          <span className="text-ink tabular-nums">{clickPct}%</span>
                          <span className={`text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded border ${cg.cls}`}>{cg.label}</span>
                          <span className="text-xs text-muted">({r.clickCount})</span>
                        </div>
                      ) : <span className="text-xs text-muted">—</span>}
                    </td>
                    <td className="px-3 py-3 text-xs text-muted whitespace-nowrap">
                      {r.startedAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
