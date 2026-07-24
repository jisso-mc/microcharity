import Link from "next/link";
import {
  resolveRange, recentFyLabels, donationSummary, perCauseBreakdown, topDonors,
  pendingDonations, receiptAudit, inr,
} from "@/lib/reports";

export const metadata = { title: "Reports — Admin" };
export const dynamic = "force-dynamic";

const CARD = "rounded-2xl bg-white border border-[var(--color-line)] p-5";
const SECTION = "rounded-2xl bg-white border border-[var(--color-line)] p-6";
const TH = "text-left font-semibold px-3 py-2 text-xs uppercase tracking-wider text-muted";
const TD = "px-3 py-2 text-sm";
const fmtDay = (d: Date) => d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

export default async function ReportsAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ fy?: string; from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const now = new Date();
  const resolved = resolveRange(sp, now);
  const { range, label, fy, from, to } = resolved;

  const [summary, causes, donors, pending, receipts] = await Promise.all([
    donationSummary(range),
    perCauseBreakdown(range),
    topDonors(range, 50),
    pendingDonations(range),
    receiptAudit(range),
  ]);

  const fyOptions = recentFyLabels(now, 6);
  // Build an export URL carrying the active range.
  const rangeQuery = new URLSearchParams();
  if (fy && fy !== "custom") rangeQuery.set("fy", fy);
  else { if (from) rangeQuery.set("from", from); if (to) rangeQuery.set("to", to); }
  const exportHref = (report: string, format = "csv") => {
    const q = new URLSearchParams(rangeQuery);
    q.set("report", report);
    q.set("format", format);
    return `/api/admin/reports/export?${q.toString()}`;
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-ink">Reports</h1>
          <p className="text-sm text-muted mt-1">
            Showing <strong className="text-ink">{label}</strong>. Monetary figures count <strong>approved</strong> donations by record date.
          </p>
        </div>
        <a
          href={exportHref("summary", "pdf")}
          className="rounded-full border border-[var(--color-line)] bg-white text-ink text-sm font-semibold px-4 py-2 hover:border-ink transition"
        >
          ⬇ Summary PDF
        </a>
      </div>

      {/* Filter bar */}
      <form method="get" className="rounded-2xl bg-white border border-[var(--color-line)] p-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-semibold text-ink mb-1">Financial year</label>
          <select name="fy" defaultValue={fy} className="rounded-lg border border-[var(--color-line)] px-3 py-2 text-sm bg-white">
            {fyOptions.map((f) => <option key={f} value={f}>FY {f}</option>)}
            <option value="all">All time</option>
            <option value="custom">Custom range…</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-ink mb-1">From</label>
          <input type="date" name="from" defaultValue={from} className="rounded-lg border border-[var(--color-line)] px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-ink mb-1">To</label>
          <input type="date" name="to" defaultValue={to} className="rounded-lg border border-[var(--color-line)] px-3 py-2 text-sm" />
        </div>
        <button type="submit" className="rounded-full bg-accent-600 hover:bg-accent-700 text-white text-sm font-semibold px-5 py-2 transition">Apply</button>
        <p className="text-xs text-muted w-full sm:w-auto">Pick an FY, or choose “Custom range…” and set From/To.</p>
      </form>

      {/* Summary cards */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl text-ink">Donation summary</h2>
          <ExportLinks href={exportHref("summary")} pdf={exportHref("summary", "pdf")} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="Approved raised" value={inr(summary.approvedAmount)} sub={`${summary.approvedCount} donations`} />
          <Stat label="Pending" value={inr(summary.pendingAmount)} sub={`${summary.pendingCount} awaiting approval`} />
          <Stat label="Unique donors" value={String(summary.uniqueDonors)} sub="with an approved gift" />
          <Stat label="All donations" value={String(summary.totalCount)} sub="every status" />
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          <MiniTable title="By status" rows={summary.byStatus.map((s) => [s.status, String(s.count), inr(s.amount)])} />
          <MiniTable title="By type (approved)" rows={summary.byType.map((t) => [t.type, String(t.count), inr(t.amount)])} />
        </div>
      </section>

      {/* Per-cause */}
      <section className={SECTION}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-xl text-ink">Per-cause breakdown</h2>
          <ExportLinks href={exportHref("causes")} />
        </div>
        {causes.length === 0 ? <Empty /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead><tr>
                <th className={TH}>Cause</th><th className={TH}>MC ID</th>
                <th className={`${TH} text-right`}>Donations</th><th className={`${TH} text-right`}>Approved amount</th>
              </tr></thead>
              <tbody>
                {causes.map((c) => (
                  <tr key={c.causeId} className="border-t border-[var(--color-line)]">
                    <td className={TD}><Link href={`/admin/causes/${c.slug}`} className="text-ink hover:text-accent-600">{c.title}</Link></td>
                    <td className={`${TD} font-mono text-xs text-muted`}>{c.mcId ?? "—"}</td>
                    <td className={`${TD} text-right tabular-nums`}>{c.count}</td>
                    <td className={`${TD} text-right tabular-nums font-semibold`}>{inr(c.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Top donors */}
      <section className={SECTION}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-display text-xl text-ink">Donor report</h2>
            <p className="text-xs text-muted mt-0.5">Top 50 by approved amount. Full list in the CSV.</p>
          </div>
          <ExportLinks href={exportHref("donors")} />
        </div>
        {donors.length === 0 ? <Empty /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px]">
              <thead><tr>
                <th className={TH}>Donor</th><th className={TH}>Email</th>
                <th className={`${TH} text-right`}>Donations</th><th className={`${TH} text-right`}>Total given</th>
              </tr></thead>
              <tbody>
                {donors.map((d) => (
                  <tr key={d.email} className="border-t border-[var(--color-line)]">
                    <td className={`${TD} text-ink`}>{d.name}</td>
                    <td className={`${TD} text-muted`}>{d.email}</td>
                    <td className={`${TD} text-right tabular-nums`}>{d.count}</td>
                    <td className={`${TD} text-right tabular-nums font-semibold`}>{inr(d.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Pending donations */}
      <section className={SECTION}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-xl text-ink">Pending donations <span className="text-muted font-sans text-base">({pending.length})</span></h2>
          <ExportLinks href={exportHref("pending")} />
        </div>
        {pending.length === 0 ? <p className="text-sm text-muted">Nothing pending in this range. 🎉</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead><tr>
                <th className={TH}>Created</th><th className={TH}>Donor</th><th className={TH}>Cause</th>
                <th className={TH}>Type</th><th className={`${TH} text-right`}>Amount</th><th className={TH}></th>
              </tr></thead>
              <tbody>
                {pending.map((p) => (
                  <tr key={p.id} className="border-t border-[var(--color-line)]">
                    <td className={`${TD} text-muted whitespace-nowrap`}>{fmtDay(p.createdAt)}</td>
                    <td className={TD}><span className="text-ink">{p.donorName}</span><br /><span className="text-xs text-muted">{p.donorEmail}</span></td>
                    <td className={TD}>{p.causeTitle}</td>
                    <td className={`${TD} uppercase text-xs`}>{p.type}</td>
                    <td className={`${TD} text-right tabular-nums font-semibold`}>{inr(p.amount)}</td>
                    <td className={TD}><Link href="/admin/donations" className="text-accent-600 hover:text-accent-700 text-xs font-semibold">Review →</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Receipt audit */}
      <section className={SECTION}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-xl text-ink">Receipt audit</h2>
          <ExportLinks href={exportHref("receipts")} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <Stat label="Approved" value={String(receipts.approvedCount)} sub="in range" />
          <Stat label="With receipt" value={String(receipts.withReceipt)} sub={`${receipts.approvedCount - receipts.withReceipt} missing`} />
          <Stat label="Emailed" value={String(receipts.receiptSent)} sub={`${receipts.notSent.length} not emailed`} />
          <Stat label="Gaps" value={String(receipts.missingReceipt.length)} sub="need a receipt" />
        </div>
        {receipts.missingReceipt.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3">
            <p className="text-sm font-semibold text-amber-800 mb-2">Approved donations without a receipt ({receipts.missingReceipt.length})</p>
            <ul className="space-y-1 text-xs text-amber-900/90 max-h-56 overflow-y-auto">
              {receipts.missingReceipt.slice(0, 50).map((m) => (
                <li key={m.id}>{fmtDay(m.createdAt)} · {m.donorName} ({m.donorEmail}) · {m.causeTitle} · {inr(m.amount)}</li>
              ))}
              {receipts.missingReceipt.length > 50 && <li className="text-amber-700">…and {receipts.missingReceipt.length - 50} more — see CSV.</li>}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className={CARD}>
      <p className="text-xs uppercase tracking-wider text-muted font-semibold">{label}</p>
      <p className="font-display text-2xl text-ink mt-2 tabular-nums">{value}</p>
      {sub && <p className="text-xs text-muted mt-1">{sub}</p>}
    </div>
  );
}

function MiniTable({ title, rows }: { title: string; rows: string[][] }) {
  return (
    <div className={SECTION}>
      <h3 className="font-display text-lg text-ink mb-3">{title}</h3>
      {rows.length === 0 ? <Empty /> : (
        <table className="w-full text-sm">
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-[var(--color-line)] first:border-0">
                <td className="py-2 uppercase tracking-wider text-xs font-semibold text-ink">{r[0].toLowerCase()}</td>
                <td className="py-2 text-right text-muted">{r[1]}</td>
                <td className="py-2 text-right tabular-nums">{r[2]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ExportLinks({ href, pdf }: { href: string; pdf?: string }) {
  return (
    <div className="flex items-center gap-2 whitespace-nowrap">
      <a href={href} className="rounded-full border border-[var(--color-line)] text-ink text-xs font-semibold px-3 py-1.5 hover:border-ink transition">⬇ CSV</a>
      {pdf && <a href={pdf} className="rounded-full border border-[var(--color-line)] text-ink text-xs font-semibold px-3 py-1.5 hover:border-ink transition">⬇ PDF</a>}
    </div>
  );
}

function Empty() {
  return <p className="text-sm text-muted">No data in this range.</p>;
}
