import Link from "next/link";
import type { DonationStatus, DonationType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { inrShort } from "@/lib/format";
import PendingActions from "./PendingActions";
import ResendReceiptButton from "./ResendReceiptButton";

export const metadata = { title: "Donations — Admin" };
export const dynamic = "force-dynamic";

type Search = {
  status?: string;
  type?: string;
  q?: string;
  created?: string;
};

const STATUS_BADGE: Record<DonationStatus, string> = {
  PENDING:  "bg-yellow-50 text-yellow-700 border-yellow-200",
  APPROVED: "bg-green-50 text-green-700 border-green-200",
  REJECTED: "bg-[var(--color-soft)] text-muted border-[var(--color-line)]",
  FAILED:   "bg-accent-50 text-accent-700 border-accent-200",
};

export default async function DonationsAdminPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const status = (sp.status as DonationStatus | undefined) || undefined;
  const type   = (sp.type as DonationType | undefined) || undefined;
  const q      = (sp.q ?? "").trim();

  const where: Prisma.DonationWhereInput = {
    ...(status ? { status } : {}),
    ...(type   ? { type }   : {}),
    ...(q
      ? {
          OR: [
            { donorNameSnapshot:  { contains: q, mode: "insensitive" } },
            { donorEmailSnapshot: { contains: q, mode: "insensitive" } },
            { paymentReference:   { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [donations, totalAll, pendingCount] = await Promise.all([
    prisma.donation.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { cause: { select: { title: true, slug: true } } },
    }),
    prisma.donation.count(),
    prisma.donation.count({ where: { status: "PENDING" } }),
  ]);

  const filterChip = (label: string, params: Record<string, string | undefined>, active: boolean) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
    const href = qs.toString() ? `/admin/donations?${qs.toString()}` : "/admin/donations";
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
          <h1 className="font-display text-3xl text-ink">Donations</h1>
          <p className="text-sm text-muted mt-1">
            {totalAll} total · {pendingCount} pending
          </p>
        </div>
        <Link
          href="/admin/donations/new"
          className="rounded-full bg-accent-600 hover:bg-accent-700 text-white text-sm font-semibold px-4 py-2 transition"
        >
          + Add donation
        </Link>
      </div>

      {sp.created && (
        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
          Donation saved as pending. Click <strong>Approve</strong> below to count it toward the cause total.
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-2">
          {filterChip("All",      { ...baseParams }, !status)}
          {filterChip("Pending",  { ...baseParams, status: "PENDING"  }, status === "PENDING")}
          {filterChip("Approved", { ...baseParams, status: "APPROVED" }, status === "APPROVED")}
          {filterChip("Rejected", { ...baseParams, status: "REJECTED" }, status === "REJECTED")}
          {filterChip("Failed",   { ...baseParams, status: "FAILED"   }, status === "FAILED")}
        </div>
        <span className="mx-2 text-[var(--color-line)]">|</span>
        <div className="flex flex-wrap gap-2">
          {filterChip("Any type", { status, q: q || undefined }, !type)}
          {filterChip("Online",   { status, type: "ONLINE",  q: q || undefined }, type === "ONLINE")}
          {filterChip("Offline",  { status, type: "OFFLINE", q: q || undefined }, type === "OFFLINE")}
          {filterChip("Manual",   { status, type: "MANUAL",  q: q || undefined }, type === "MANUAL")}
        </div>
        <form action="/admin/donations" method="get" className="ml-auto flex items-center gap-2">
          {status && <input type="hidden" name="status" value={status} />}
          {type   && <input type="hidden" name="type"   value={type} />}
          <input
            name="q"
            defaultValue={q}
            placeholder="Search donor name, email, ref…"
            className="rounded-lg border border-[var(--color-line)] focus:border-accent-600 focus:ring-2 focus:ring-accent-100 outline-none px-3 py-2 text-sm w-72"
          />
          <button type="submit" className="text-sm font-semibold text-accent-600 hover:text-accent-700">Search</button>
        </form>
      </div>

      {/* Table */}
      {donations.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--color-line)] bg-white p-10 text-center">
          <p className="font-display text-lg text-ink mb-2">No donations match.</p>
          <p className="text-sm text-muted">Try clearing filters, or <Link href="/admin/donations/new" className="text-accent-600 font-semibold hover:text-accent-700">add a manual donation</Link>.</p>
        </div>
      ) : (
        <div className="rounded-2xl bg-white border border-[var(--color-line)] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[var(--color-soft)] text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="text-left font-semibold px-4 py-3">Donor</th>
                <th className="text-left font-semibold px-4 py-3">Cause</th>
                <th className="text-left font-semibold px-4 py-3">Type</th>
                <th className="text-left font-semibold px-4 py-3">Status</th>
                <th className="text-right font-semibold px-4 py-3">Amount</th>
                <th className="text-left font-semibold px-4 py-3">Date</th>
                <th className="text-right font-semibold px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {donations.map(d => (
                <tr key={d.id} className="border-t border-[var(--color-line)] align-top">
                  <td className="px-4 py-3 text-ink">
                    {d.donorNameSnapshot}
                    <span className="block text-xs text-muted">{d.donorEmailSnapshot}</span>
                  </td>
                  <td className="px-4 py-3 text-muted truncate max-w-[18rem]">
                    <Link href={`/donations/${d.cause.slug}`} target="_blank" className="hover:text-accent-600">{d.cause.title}</Link>
                  </td>
                  <td className="px-4 py-3 text-xs uppercase tracking-wider text-muted">{d.type.toLowerCase()}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[11px] uppercase tracking-wider font-semibold px-2 py-1 rounded border ${STATUS_BADGE[d.status]}`}>
                      {d.status.toLowerCase()}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold">{inrShort(d.amount)}</td>
                  <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">
                    <span className="block">{d.createdAt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span>
                    <span className="block">{d.createdAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}</span>
                  </td>
                  <td className="px-4 py-3">
                    {d.status === "PENDING" ? (
                      <PendingActions id={d.id} amount={d.amount} />
                    ) : d.status === "APPROVED" ? (
                      <div className="flex flex-col items-end gap-1.5">
                        {d.paymentReference && (
                          <span className="text-xs text-muted" title={d.paymentReference}>ref · {d.paymentReference}</span>
                        )}
                        <ResendReceiptButton donationId={d.id} />
                      </div>
                    ) : d.paymentReference ? (
                      <span className="text-xs text-muted block text-right" title={d.paymentReference}>ref · {d.paymentReference}</span>
                    ) : null}
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
