// Admin reporting queries. All figures are keyed off Donation.createdAt (the
// record date — same basis the donations .xlsx export uses), and monetary totals
// count APPROVED donations only unless stated otherwise. A date window is a
// half-open interval [from, toExclusive).

import { prisma } from "./prisma";

export type Range = { from: Date; toExclusive: Date };

// ---------- Financial-year helpers (Indian FY: 1 Apr – 31 Mar) ----------

/** FY label for a date, e.g. 2025-06-01 -> "2025-26". */
export function fyLabelForDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth(); // 0=Jan
  const start = m >= 3 ? y : y - 1; // April (idx 3) starts a new FY
  return `${start}-${String(start + 1).slice(-2)}`;
}

/** Current FY label (UTC "now" must be passed in — callers use new Date()). */
export function currentFyLabel(now: Date): string {
  return fyLabelForDate(now);
}

/** Half-open [Apr 1, next Apr 1) range for an FY label like "2025-26". */
export function fyRange(label: string): Range | null {
  const m = label.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const start = Number(m[1]);
  return {
    from: new Date(Date.UTC(start, 3, 1, 0, 0, 0)),
    toExclusive: new Date(Date.UTC(start + 1, 3, 1, 0, 0, 0)),
  };
}

/** The last `count` FY labels, newest first, ending with the FY of `now`. */
export function recentFyLabels(now: Date, count: number): string[] {
  const cur = fyLabelForDate(now);
  const startYear = Number(cur.split("-")[0]);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const y = startYear - i;
    out.push(`${y}-${String(y + 1).slice(-2)}`);
  }
  return out;
}

function parseDayStart(raw: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}T00:00:00.000Z`);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Resolve a reporting range from query params. Precedence:
 *   fy=all              -> everything
 *   fy=YYYY-YY          -> that financial year
 *   from & to (YYYY-MM-DD) -> that custom window (inclusive of `to`)
 *   otherwise           -> current FY
 * Returns the range plus a human label and the normalised param values so the
 * page and export links stay in sync.
 */
export function resolveRange(
  params: { fy?: string; from?: string; to?: string },
  now: Date
): { range: Range; label: string; fy: string; from: string; to: string } {
  const fy = (params.fy ?? "").trim();
  if (fy === "all") {
    return {
      range: { from: new Date(Date.UTC(2000, 0, 1)), toExclusive: new Date(Date.UTC(2100, 0, 1)) },
      label: "All time",
      fy: "all", from: "", to: "",
    };
  }
  if (fy && fy !== "custom") {
    const r = fyRange(fy);
    if (r) return { range: r, label: `FY ${fy}`, fy, from: "", to: "" };
  }
  // Custom range
  const fromRaw = (params.from ?? "").trim();
  const toRaw = (params.to ?? "").trim();
  const from = parseDayStart(fromRaw);
  const toStart = parseDayStart(toRaw);
  if (from && toStart && toStart >= from) {
    const toExclusive = new Date(toStart.getTime() + 24 * 60 * 60 * 1000);
    return { range: { from, toExclusive }, label: `${fromRaw} to ${toRaw}`, fy: "custom", from: fromRaw, to: toRaw };
  }
  // Default: current FY
  const curLabel = currentFyLabel(now);
  return { range: fyRange(curLabel)!, label: `FY ${curLabel}`, fy: curLabel, from: "", to: "" };
}

const whereRange = (r: Range) => ({ createdAt: { gte: r.from, lt: r.toExclusive } });

// ---------- Reports ----------

export type DonationSummary = {
  approvedAmount: number;
  approvedCount: number;
  pendingAmount: number;
  pendingCount: number;
  totalCount: number;
  uniqueDonors: number;
  byStatus: { status: string; count: number; amount: number }[];
  byType: { type: string; count: number; amount: number }[];
};

export async function donationSummary(r: Range): Promise<DonationSummary> {
  const [byStatusRaw, byTypeRaw, approvedDonors] = await Promise.all([
    prisma.donation.groupBy({ by: ["status"], where: whereRange(r), _count: { _all: true }, _sum: { amount: true } }),
    prisma.donation.groupBy({ by: ["type"], where: { ...whereRange(r), status: "APPROVED" }, _count: { _all: true }, _sum: { amount: true } }),
    prisma.donation.groupBy({ by: ["donorEmailSnapshot"], where: { ...whereRange(r), status: "APPROVED" } }),
  ]);

  const byStatus = byStatusRaw.map((s) => ({ status: s.status, count: s._count._all, amount: s._sum.amount ?? 0 }));
  const byType = byTypeRaw.map((t) => ({ type: t.type, count: t._count._all, amount: t._sum.amount ?? 0 }));
  const approved = byStatus.find((s) => s.status === "APPROVED");
  const pending = byStatus.find((s) => s.status === "PENDING");

  return {
    approvedAmount: approved?.amount ?? 0,
    approvedCount: approved?.count ?? 0,
    pendingAmount: pending?.amount ?? 0,
    pendingCount: pending?.count ?? 0,
    totalCount: byStatus.reduce((n, s) => n + s.count, 0),
    uniqueDonors: approvedDonors.length,
    byStatus,
    byType,
  };
}

export type CauseRow = { causeId: string; title: string; mcId: string | null; slug: string; count: number; amount: number };

export async function perCauseBreakdown(r: Range): Promise<CauseRow[]> {
  const grouped = await prisma.donation.groupBy({
    by: ["causeId"],
    where: { ...whereRange(r), status: "APPROVED" },
    _count: { _all: true },
    _sum: { amount: true },
  });
  if (grouped.length === 0) return [];
  const causes = await prisma.cause.findMany({
    where: { id: { in: grouped.map((g) => g.causeId) } },
    select: { id: true, title: true, mcId: true, slug: true },
  });
  const byId = new Map(causes.map((c) => [c.id, c]));
  return grouped
    .map((g) => ({
      causeId: g.causeId,
      title: byId.get(g.causeId)?.title ?? "(unknown cause)",
      mcId: byId.get(g.causeId)?.mcId ?? null,
      slug: byId.get(g.causeId)?.slug ?? "",
      count: g._count._all,
      amount: g._sum.amount ?? 0,
    }))
    .sort((a, b) => b.amount - a.amount);
}

export type DonorRow = { email: string; name: string; count: number; amount: number };

export async function topDonors(r: Range, limit = 100): Promise<DonorRow[]> {
  const grouped = await prisma.donation.groupBy({
    by: ["donorEmailSnapshot"],
    where: { ...whereRange(r), status: "APPROVED" },
    _count: { _all: true },
    _sum: { amount: true },
  });
  if (grouped.length === 0) return [];
  const donors = await prisma.donor.findMany({
    where: { email: { in: grouped.map((g) => g.donorEmailSnapshot) } },
    select: { email: true, name: true },
  });
  const nameByEmail = new Map(donors.map((d) => [d.email.toLowerCase(), d.name]));
  return grouped
    .map((g) => ({
      email: g.donorEmailSnapshot,
      name: nameByEmail.get(g.donorEmailSnapshot.toLowerCase()) ?? g.donorEmailSnapshot.split("@")[0],
      count: g._count._all,
      amount: g._sum.amount ?? 0,
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
}

export type PendingRow = {
  id: string; createdAt: Date; amount: number; type: string;
  donorName: string; donorEmail: string; causeTitle: string; causeSlug: string;
};

export async function pendingDonations(r: Range): Promise<PendingRow[]> {
  const rows = await prisma.donation.findMany({
    where: { ...whereRange(r), status: "PENDING" },
    orderBy: { createdAt: "asc" },
    select: {
      id: true, createdAt: true, amount: true, type: true,
      donorNameSnapshot: true, donorEmailSnapshot: true,
      cause: { select: { title: true, slug: true } },
    },
  });
  return rows.map((d) => ({
    id: d.id, createdAt: d.createdAt, amount: d.amount, type: d.type,
    donorName: d.donorNameSnapshot, donorEmail: d.donorEmailSnapshot,
    causeTitle: d.cause.title, causeSlug: d.cause.slug,
  }));
}

export type ReceiptAudit = {
  approvedCount: number;
  withReceipt: number;
  receiptSent: number;
  missingReceipt: { id: string; createdAt: Date; amount: number; donorName: string; donorEmail: string; causeTitle: string }[];
  notSent: { id: string; receiptNumber: string; donorName: string; donorEmail: string; amount: number }[];
};

export async function receiptAudit(r: Range): Promise<ReceiptAudit> {
  const approved = await prisma.donation.findMany({
    where: { ...whereRange(r), status: "APPROVED" },
    orderBy: { createdAt: "asc" },
    select: {
      id: true, createdAt: true, amount: true,
      donorNameSnapshot: true, donorEmailSnapshot: true,
      cause: { select: { title: true } },
      receipt: { select: { receiptNumber: true, sentAt: true } },
    },
  });
  const withReceipt = approved.filter((d) => d.receipt).length;
  const receiptSent = approved.filter((d) => d.receipt?.sentAt).length;
  const missingReceipt = approved
    .filter((d) => !d.receipt)
    .map((d) => ({ id: d.id, createdAt: d.createdAt, amount: d.amount, donorName: d.donorNameSnapshot, donorEmail: d.donorEmailSnapshot, causeTitle: d.cause.title }));
  const notSent = approved
    .filter((d) => d.receipt && !d.receipt.sentAt)
    .map((d) => ({ id: d.id, receiptNumber: d.receipt!.receiptNumber, donorName: d.donorNameSnapshot, donorEmail: d.donorEmailSnapshot, amount: d.amount }));
  return { approvedCount: approved.length, withReceipt, receiptSent, missingReceipt, notSent };
}

/** Exact INR with Indian grouping (reports need precise figures, not lakh/crore). */
export const inr = (n: number) => `₹${Math.round(n || 0).toLocaleString("en-IN")}`;
