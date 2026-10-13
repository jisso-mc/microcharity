import Link from "next/link";
import type { DonationStatus, DonationType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { inrShort } from "@/lib/format";
import PendingActions from "./PendingActions";
import ResendReceiptButton from "./ResendReceiptButton";
import DownloadReceiptButton from "./DownloadReceiptButton";
import ExportPanel from "./ExportPanel";

export const metadata = { title: "Donations — Admin" };
export const dynamic = "force-dynamic";
// Server actions invoked from this page (approve, resend receipt, manual create)
// can take 5-15 seconds — receipt resend in particular synchronously runs PDF
// generation + 2 Gmail SMTP sends so the button label updates correctly. The
// default Vercel function timeout sits right at the edge of that, so admins
// occasionally saw "server-side exception" pages even when the underlying work
// (email actually delivered) had succeeded. Raise the ceiling to 60s.
export const maxDuration = 60;

type Search = {
  status?: string;
  type?: string;
  q?: string;
  created?: string;
  edited?: string;
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
      include: {
        cause: { select: { title: true, slug: true } },
        // We need to know whether the 80G receipt has actually been emailed
        // for this donation so the button can read "Send receipt" (first
        // time) vs "Resend receipt" (re-issue). receipt is null when the
        // PDF was never generated — happens for OFFLINE / QR / MANUAL
        // donations that were Approved (pledge confirmed) but money hasn't
        // landed yet. sentAt is null when the row exists but the email
        // hasn't gone out (transient SMTP failure case).
        receipt: { select: { sentAt: true } },
      },
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

  // Default the export range to the start of the current Indian financial
  // year (April 1) through today — covers the most common auditor request.
  const now = new Date();
  const fyStartYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const defaultFrom = `${fyStartYear}-04-01`;
  const defaultTo = now.toISOString().slice(0, 10);


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

      {/* Auditor export: pick a date range, download an .xlsx with every
          field for every donation created in that window. Status filter is
          optional — leave blank to include pending / rejected / failed too. */}
      <ExportPanel defaultFrom={defaultFrom} defaultTo={defaultTo} />


      {sp.created && (
        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
          Donation saved as pending. Click <strong>Approve</strong> below to count it toward the cause total.
        </div>
      )}

      {sp.edited && (
        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
          Donation updated. If its receipt was already emailed, use <strong>Resend receipt</strong> to send the corrected one.
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
                    {d.attachmentUrl && (
                      <a
                        href={d.attachmentUrl}
                        target="_blank"
                        rel="noopener"
                        className="inline-flex items-center gap-1 mt-1 text-xs font-semibold text-accent-700 hover:text-accent-600"
                      >
                        View screenshot
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17 17 7"/><path d="M7 7h10v10"/></svg>
                      </a>
                    )}
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
                    <div className="flex justify-end mb-1.5">
                      <Link href={`/admin/donations/${d.id}/edit`} className="text-xs font-semibold text-muted hover:text-ink">Edit</Link>
                    </div>
                    {d.status === "PENDING" ? (
                      <PendingActions id={d.id} amount={d.amount} />
                    ) : d.status === "APPROVED" ? (
                      <div className="flex flex-col items-end gap-1.5">
                        {d.paymentReference && (
                          <span className="text-xs text-muted" title={d.paymentReference}>ref · {d.paymentReference}</span>
                        )}
                        {/* receiptSent === false here means: donation was
                            approved (pledge confirmed, raised total bumped)
                            but the 80G email hasn't been sent. Button reads
                            "Send receipt" and is visually emphasised so Jisso
                            can spot pending receipts at a glance. Once sent,
                            it reverts to a muted "Resend receipt". */}
                        <ResendReceiptButton donationId={d.id} receiptSent={!!d.receipt?.sentAt} />
                        <DownloadReceiptButton donationId={d.id} />
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
