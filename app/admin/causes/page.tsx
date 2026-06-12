import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { inrShort } from "@/lib/format";
import CauseRowMenu from "./CauseRowMenu";

export const metadata = { title: "Causes — Admin" };
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  PUBLISHED: "Published",
  DRAFT:     "Draft",
  CLOSED:    "Closed",
};

const STATUS_CLS: Record<string, string> = {
  PUBLISHED: "bg-accent-50 text-accent-700",
  DRAFT:     "bg-[var(--color-soft)] text-muted",
  CLOSED:    "bg-[var(--color-soft)] text-muted",
};

type Search = { year?: string; status?: string; q?: string };

function fmtMonthYear(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}

export default async function CausesAdminPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const yearRaw = (sp.year ?? "").trim();
  const year = /^\d{4}$/.test(yearRaw) ? Number(yearRaw) : null;
  const statusFilter = (sp.status ?? "").trim();
  const q = (sp.q ?? "").trim();

  const where: Prisma.CauseWhereInput = {
    ...(year
      ? { startDate: { gte: new Date(year, 0, 1), lt: new Date(year + 1, 0, 1) } }
      : {}),
    ...(statusFilter && ["PUBLISHED", "DRAFT", "CLOSED"].includes(statusFilter)
      ? { status: statusFilter as "PUBLISHED" | "DRAFT" | "CLOSED" }
      : {}),
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { slug:  { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [causes, allDates] = await Promise.all([
    prisma.cause.findMany({
      where,
      // Newest launches first; nulls come last via the secondary sort on createdAt.
      orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
      select: {
        id: true, slug: true, title: true, status: true,
        goalAmount: true, raisedAmount: true,
        startDate: true, createdAt: true,
        // Approved-donation count gates the Delete menu item — a cause with
        // real (receipted) giving history can't be hard-deleted. PENDING /
        // FAILED / REJECTED rows don't count, so a test cause with only an
        // un-approved submission stays deletable.
        _count: { select: { donations: { where: { status: "APPROVED" } } } },
      },
    }),
    // Pull every cause's startDate (cheap — just one indexed column) so we can build
    // the year-filter chips with per-year counts.
    prisma.cause.findMany({ select: { startDate: true } }),
  ]);

  // Group all causes by calendar year of their startDate (or fallback to createdAt).
  const yearCounts = new Map<number, number>();
  for (const c of allDates) {
    const d = c.startDate ?? null;
    if (!d) continue;
    const y = new Date(d).getUTCFullYear();
    yearCounts.set(y, (yearCounts.get(y) ?? 0) + 1);
  }
  const years = [...yearCounts.entries()].sort((a, b) => b[0] - a[0]); // newest first

  const filterChip = (label: string, params: Record<string, string | undefined>, active: boolean) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
    const href = qs.toString() ? `/admin/causes?${qs.toString()}` : "/admin/causes";
    return (
      <Link
        key={label}
        href={href}
        className={`text-xs font-semibold uppercase tracking-wider px-3 py-1.5 rounded-full border transition ${
          active ? "bg-ink text-white border-ink" : "border-[var(--color-line)] text-muted hover:border-ink hover:text-ink"
        }`}
      >
        {label}
      </Link>
    );
  };

  const baseParams = { status: statusFilter || undefined, q: q || undefined };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl text-ink">Causes</h1>
          <p className="text-sm text-muted mt-1">
            {causes.length} {year ? `launched in ${year}` : "shown"}
            {statusFilter ? ` · ${STATUS_LABEL[statusFilter] ?? statusFilter}` : ""}
            {q ? ` · matching "${q}"` : ""}
          </p>
        </div>
        <Link href="/admin/causes/new" className="rounded-full bg-accent-600 hover:bg-accent-700 text-white text-sm font-semibold px-4 py-2 transition">
          + New cause
        </Link>
      </div>

      {/* Filter chips: launch year + status + search */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-2">
          {filterChip("All years", { ...baseParams }, !year)}
          {years.map(([y, n]) =>
            filterChip(`${y} (${n})`, { ...baseParams, year: String(y) }, year === y)
          )}
        </div>
        <span className="mx-2 text-[var(--color-line)]">|</span>
        <div className="flex flex-wrap gap-2">
          {filterChip("Any status", { year: yearRaw || undefined, q: q || undefined }, !statusFilter)}
          {filterChip("Published", { year: yearRaw || undefined, status: "PUBLISHED", q: q || undefined }, statusFilter === "PUBLISHED")}
          {filterChip("Draft",     { year: yearRaw || undefined, status: "DRAFT",     q: q || undefined }, statusFilter === "DRAFT")}
          {filterChip("Closed",    { year: yearRaw || undefined, status: "CLOSED",    q: q || undefined }, statusFilter === "CLOSED")}
        </div>
        <form action="/admin/causes" method="get" className="ml-auto flex items-center gap-2">
          {yearRaw && <input type="hidden" name="year" value={yearRaw} />}
          {statusFilter && <input type="hidden" name="status" value={statusFilter} />}
          <input
            name="q"
            defaultValue={q}
            placeholder="Search title or slug…"
            className="rounded-lg border border-[var(--color-line)] focus:border-accent-600 focus:ring-2 focus:ring-accent-100 outline-none px-3 py-2 text-sm w-60"
          />
          <button type="submit" className="text-sm font-semibold text-accent-600 hover:text-accent-700">Search</button>
        </form>
      </div>

      <div className="rounded-2xl bg-white border border-[var(--color-line)] overflow-x-auto">
        <table className="w-full text-sm min-w-[860px]">
          <thead className="bg-[var(--color-soft)] text-xs uppercase tracking-wider text-muted">
            <tr>
              <th className="text-left font-semibold px-4 py-3">Title</th>
              <th className="text-left font-semibold px-3 py-3 w-[7rem]">Launched</th>
              <th className="text-left font-semibold px-3 py-3 w-[7rem]">Status</th>
              <th className="text-right font-semibold px-3 py-3 w-[8rem]">Raised / Goal</th>
              <th className="text-right font-semibold px-4 py-3 w-16">Actions</th>
            </tr>
          </thead>
          <tbody>
            {causes.map(c => {
              const pct = c.goalAmount > 0 ? Math.min(100, Math.round((c.raisedAmount / c.goalAmount) * 100)) : 0;
              return (
                <tr key={c.id} className="border-t border-[var(--color-line)] hover:bg-[var(--color-soft)]/50 align-top">
                  <td className="px-4 py-3 max-w-[24rem]">
                    <Link href={`/admin/causes/${c.slug}`} className="block text-ink font-medium truncate hover:text-accent-600">
                      {c.title}
                    </Link>
                    <span className="block text-xs text-muted font-mono truncate mt-0.5">{c.slug}</span>
                  </td>
                  <td className="px-3 py-3 text-xs text-muted whitespace-nowrap">
                    {fmtMonthYear(c.startDate)}
                  </td>
                  <td className="px-3 py-3">
                    <span className={`text-[11px] uppercase tracking-wider font-semibold px-2 py-1 rounded ${STATUS_CLS[c.status] ?? ""}`}>
                      {STATUS_LABEL[c.status] ?? c.status}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">
                    <span className="block text-ink">{inrShort(c.raisedAmount)}</span>
                    <span className="block text-xs text-muted">of {inrShort(c.goalAmount)} · {pct}%</span>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <CauseRowMenu
                      causeId={c.id}
                      slug={c.slug}
                      causeTitle={c.title}
                      hasDonations={c._count.donations > 0}
                      statusVariant={
                        c.status === "PUBLISHED" ? "close" :
                        c.status === "CLOSED"    ? "reopen" :
                        c.status === "DRAFT"     ? "publish" :
                        null
                      }
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
