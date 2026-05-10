import Link from "next/link";
import type { ApplicationFormType, ApplicationStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { FORM_TYPE_LABEL } from "@/lib/applications";

export const metadata = { title: "Forms — Admin" };
export const dynamic = "force-dynamic";

type Search = { type?: string; status?: string; q?: string };

const STATUS_BADGE: Record<ApplicationStatus, string> = {
  SUBMITTED:    "bg-blue-50 text-blue-700 border-blue-200",
  UNDER_REVIEW: "bg-yellow-50 text-yellow-700 border-yellow-200",
  APPROVED:     "bg-green-50 text-green-700 border-green-200",
  REJECTED:     "bg-[var(--color-soft)] text-muted border-[var(--color-line)]",
};

const TYPE_BADGE: Record<ApplicationFormType, string> = {
  EDUCATIONAL:    "bg-violet-50 text-violet-700 border-violet-200",
  MEDICAL:        "bg-rose-50 text-rose-700 border-rose-200",
  INDIVIDUAL:     "bg-amber-50 text-amber-700 border-amber-200",
  ORGANIZATIONAL: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

export default async function AdminFormsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const type   = (sp.type as ApplicationFormType | undefined) || undefined;
  const status = (sp.status as ApplicationStatus | undefined) || undefined;
  const q      = (sp.q ?? "").trim();

  const where: Prisma.CauseApplicationWhereInput = {
    ...(type   ? { formType: type } : {}),
    ...(status ? { status }         : {}),
    ...(q
      ? {
          OR: [
            { fullName:      { contains: q, mode: "insensitive" } },
            { phone:         { contains: q, mode: "insensitive" } },
            { email:         { contains: q, mode: "insensitive" } },
            { applicationNo: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [rows, totalAll, byStatus] = await Promise.all([
    prisma.causeApplication.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true, applicationNo: true, formType: true, status: true,
        fullName: true, phone: true, email: true, createdAt: true,
      },
    }),
    prisma.causeApplication.count(),
    prisma.causeApplication.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  const counts: Record<ApplicationStatus, number> = {
    SUBMITTED: 0, UNDER_REVIEW: 0, APPROVED: 0, REJECTED: 0,
  };
  for (const r of byStatus) counts[r.status] = r._count._all;

  const filterChip = (label: string, params: Record<string, string | undefined>, active: boolean) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
    const href = qs.toString() ? `/admin/forms?${qs.toString()}` : "/admin/forms";
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

  const baseParams = { type, q: q || undefined };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-ink">Forms</h1>
          <p className="text-sm text-muted mt-1">
            {totalAll} total · {counts.SUBMITTED} submitted · {counts.UNDER_REVIEW} under review · {counts.APPROVED} approved · {counts.REJECTED} rejected
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-2">
          {filterChip("All",          { ...baseParams }, !status)}
          {filterChip("Submitted",    { ...baseParams, status: "SUBMITTED"    }, status === "SUBMITTED")}
          {filterChip("Under review", { ...baseParams, status: "UNDER_REVIEW" }, status === "UNDER_REVIEW")}
          {filterChip("Approved",     { ...baseParams, status: "APPROVED"     }, status === "APPROVED")}
          {filterChip("Rejected",     { ...baseParams, status: "REJECTED"     }, status === "REJECTED")}
        </div>
        <span className="mx-2 text-[var(--color-line)]">|</span>
        <div className="flex flex-wrap gap-2">
          {filterChip("Any type",       { status, q: q || undefined }, !type)}
          {filterChip("Educational",    { status, type: "EDUCATIONAL",    q: q || undefined }, type === "EDUCATIONAL")}
          {filterChip("Medical",        { status, type: "MEDICAL",        q: q || undefined }, type === "MEDICAL")}
          {filterChip("Individuals",    { status, type: "INDIVIDUAL",     q: q || undefined }, type === "INDIVIDUAL")}
          {filterChip("Organizational", { status, type: "ORGANIZATIONAL", q: q || undefined }, type === "ORGANIZATIONAL")}
        </div>
        <form action="/admin/forms" method="get" className="ml-auto flex items-center gap-2">
          {status && <input type="hidden" name="status" value={status} />}
          {type   && <input type="hidden" name="type"   value={type} />}
          <input
            name="q"
            defaultValue={q}
            placeholder="Search name / phone / email / app#…"
            className="rounded-lg border border-[var(--color-line)] focus:border-accent-600 focus:ring-2 focus:ring-accent-100 outline-none px-3 py-2 text-sm w-72"
          />
          <button type="submit" className="text-sm font-semibold text-accent-600 hover:text-accent-700">Search</button>
        </form>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--color-line)] bg-white p-10 text-center">
          <p className="font-display text-lg text-ink mb-2">No applications match.</p>
          <p className="text-sm text-muted">Try clearing filters.</p>
        </div>
      ) : (
        <div className="rounded-2xl bg-white border border-[var(--color-line)] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[var(--color-soft)] text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="text-left font-semibold px-4 py-3">Date</th>
                <th className="text-left font-semibold px-4 py-3">Application No</th>
                <th className="text-left font-semibold px-4 py-3">Type</th>
                <th className="text-left font-semibold px-4 py-3">Name</th>
                <th className="text-left font-semibold px-4 py-3">Phone</th>
                <th className="text-left font-semibold px-4 py-3">Status</th>
                <th className="text-right font-semibold px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-[var(--color-line)] hover:bg-[var(--color-soft)]/50 transition">
                  <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">{r.createdAt.toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" })}</td>
                  <td className="px-4 py-3 font-mono text-xs text-ink">{r.applicationNo}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-1 rounded border ${TYPE_BADGE[r.formType]}`}>
                      {FORM_TYPE_LABEL[r.formType]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-ink">
                    {r.fullName}
                    {r.email && <span className="block text-xs text-muted">{r.email}</span>}
                  </td>
                  <td className="px-4 py-3 text-muted">{r.phone}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-1 rounded border ${STATUS_BADGE[r.status]}`}>
                      {r.status.replace("_", " ").toLowerCase()}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/admin/forms/${r.id}`} className="text-xs font-semibold text-accent-600 hover:text-accent-700">View →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
