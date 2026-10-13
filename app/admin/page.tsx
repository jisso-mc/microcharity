import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { inrShort } from "@/lib/format";
import SiteStatsEditor from "./SiteStatsEditor";
import { getSiteTotalsBreakdown, LEGACY_TOTALS_LABEL, LIVE_TOTALS_LABEL } from "@/lib/data/stats";
import { currentFyLabel, fyRange } from "@/lib/reports";

export const metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const user = await getCurrentUser();

  // Current financial year (1 Apr – 31 Mar), rolls over automatically each April.
  const fy = currentFyLabel(new Date());          // "2026-27"
  const fyWindow = fyRange(fy)!;
  const fyMcIdSuffix = `-${fy.slice(2)}`;          // "-26-27"

  // One Neon round-trip for all five KPIs. Previously six parallel
  // Promise.all queries, which on a cold Neon compute could stack 2-5
  // seconds of per-query connection latency on top of each other. This
  // collapses to a single statement; the siteStat lookup stays separate
  // because it involves an upsert + relation include.
  const [kpiRow, siteStat, totals, fyCauses, fyDonations] = await Promise.all([
    prisma.$queryRaw<Array<{
      active_count: bigint;
      total_causes: bigint;
      total_donors: bigint;
    }>>`
      SELECT
        (SELECT COUNT(*) FROM "Cause" WHERE "status" = 'PUBLISHED')             AS active_count,
        (SELECT COUNT(*) FROM "Cause")                                          AS total_causes,
        -- Donors KPI excludes soft-deleted rows so the dashboard reflects the
        -- real donor count (matches what /admin/donors lists). The 87 spam
        -- rows soft-deleted on May 24 would otherwise pad this number.
        (SELECT COUNT(*) FROM "Donor" WHERE "deletedAt" IS NULL)                AS total_donors
    `,
    prisma.siteStat.upsert({
      where: { id: 1 },
      create: { id: 1, donationCount: 4505, raisedAmount: 16112720 },
      update: {},
      include: { updatedBy: { select: { name: true } } },
    }),
    // Total donations / Total raised = legacy SiteStat figures + live approved
    // donations from FY 2026-27 onwards — the same numbers the home page shows.
    getSiteTotalsBreakdown(),
    // FY causes are counted by MCID suffix (MCID-{seq}-{YY-YY}), which encodes the
    // FY the cause was raised in. Cause.createdAt is unusable here — the whole
    // WordPress catalogue was imported in May 2026.
    prisma.cause.count({ where: { mcId: { endsWith: fyMcIdSuffix } } }),
    // FY donations: APPROVED, made within the FY — same basis as /admin/reports.
    prisma.donation.aggregate({
      where: { status: "APPROVED", createdAt: { gte: fyWindow.from, lt: fyWindow.toExclusive } },
      _count: { _all: true },
      _sum: { amount: true },
    }),
  ]);
  const k = kpiRow[0];
  const activeCount = Number(k.active_count);
  const totalCauses = Number(k.total_causes);
  const totalDonors = Number(k.total_donors);
  const { legacy, live, total } = totals;

  const kpis: { label: string; value: string; note?: string }[] = [
    { label: "Active causes", value: String(activeCount) },
    { label: "Total causes", value: String(totalCauses) },
    {
      label: "Total donations",
      value: total.donationCountLabel,
      note: `${legacy.donationCount.toLocaleString("en-IN")} legacy + ${live.donationCount.toLocaleString("en-IN")} ${LIVE_TOTALS_LABEL}`,
    },
    { label: "Total donors", value: String(totalDonors) },
    {
      label: "Total raised",
      value: inrShort(total.raisedAmount),
      note: `${inrShort(legacy.raisedAmount)} legacy + ${inrShort(live.raisedAmount)} ${LIVE_TOTALS_LABEL}`,
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl text-ink">Welcome{user?.name ? `, ${user.name.split(" ")[0]}` : ""}.</h1>
        <p className="text-sm text-muted mt-1">Dashboard overview.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {kpis.map(k => (
          <div key={k.label} className="rounded-2xl bg-white border border-[var(--color-line)] p-5">
            <p className="text-xs uppercase tracking-wider text-muted font-semibold">{k.label}</p>
            <p className="font-display text-2xl text-ink mt-2">{k.value}</p>
            {k.note && <p className="text-xs text-muted mt-1">{k.note}</p>}
          </div>
        ))}
      </div>

      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
          <h2 className="font-display text-xl text-ink">Financial year {fy}</h2>
          <span className="text-xs text-muted">1 Apr {fy.slice(0, 4)} – 31 Mar {Number(fy.slice(0, 4)) + 1}</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: "Total causes", value: fyCauses.toLocaleString("en-IN") },
            { label: "No. of donations", value: fyDonations._count._all.toLocaleString("en-IN") },
            { label: "Total donations raised", value: inrShort(fyDonations._sum.amount ?? 0) },
          ].map(k => (
            <div key={k.label} className="rounded-2xl bg-white border border-[var(--color-line)] p-5">
              <p className="text-xs uppercase tracking-wider text-muted font-semibold">{k.label}</p>
              <p className="font-display text-2xl text-ink mt-2">{k.value}</p>
            </div>
          ))}
        </div>
      </div>

      <SiteStatsEditor
        donationCount={siteStat.donationCount}
        raisedAmount={siteStat.raisedAmount}
        isAdmin={user?.role === "ADMIN"}
        updatedAt={siteStat.updatedAt.toISOString()}
        updatedByName={siteStat.updatedBy?.name ?? null}
        legacyLabel={LEGACY_TOTALS_LABEL}
        liveLabel={LIVE_TOTALS_LABEL}
        liveDonationCount={live.donationCount}
        liveRaisedAmount={live.raisedAmount}
      />

      <div className="rounded-2xl bg-white border border-[var(--color-line)] p-6">
        <h2 className="font-display text-xl text-ink mb-2">Build order</h2>
        <ol className="list-decimal pl-5 text-sm text-body space-y-1">
          <li>✅ PostgreSQL + Prisma schema</li>
          <li>✅ Admin auth (login + protected routes)</li>
          <li>Causes CMS (CM-010…026) — list view, create/edit, publish flow</li>
          <li>Donations management — list, filter, approve, manual entry (DM-001…022)</li>
          <li>Razorpay integration — order creation + webhook</li>
          <li>Receipt template editor + PDF generation</li>
          <li>Donors management + cumulative 80G receipts</li>
          <li>Email campaigns via Gmail API</li>
          <li>Reports</li>
        </ol>
      </div>
    </div>
  );
}
