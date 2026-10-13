// Site-wide donation totals shown on the home page / about page / success stories.
//
// Two parts, added together:
//   * LEGACY — the SiteStat singleton, MANUALLY entered by an admin via /admin.
//     Covers everything up to the end of FY 2025-26 (31-Mar-2026), including the
//     WordPress-era donations that were never in this database.
//   * LIVE — APPROVED donations made through this system from 01-Apr-2026 (start
//     of FY 2026-27) onwards, counted from the Donation table on every render.
//
// Keyed on Donation.createdAt (when the donation was made), NOT approvedAt —
// imported WordPress-era donations from 2019-2024 were approved in May 2026 and
// must not leak into the live figures (the legacy figure already includes them).
//
// Public pages are ISR (60s); revalidateSiteTotals() busts them immediately
// whenever a donation is approved or the legacy figures are edited.

import { revalidatePath } from "next/cache";
import { prisma } from "../prisma";

// 01-Apr-2026 00:00 IST — first day of FY 2026-27.
export const LIVE_TOTALS_FROM = new Date("2026-03-31T18:30:00.000Z");
export const LEGACY_TOTALS_LABEL = "up to FY 2025-26";
export const LIVE_TOTALS_LABEL = "FY 2026-27 onwards";

export type SiteTotals = {
  donationCount: number;
  raisedAmount: number;
  donationCountLabel: string;  // e.g. "4,505"
  raisedAmountLabel: string;   // e.g. "₹1,61,12,720"
  raisedShortLabel: string;    // e.g. "₹1.61 crores" for compact contexts
};

export type SiteTotalsBreakdown = {
  legacy: { donationCount: number; raisedAmount: number };
  live: { donationCount: number; raisedAmount: number };
  total: SiteTotals;
};

export async function getSiteTotalsBreakdown(): Promise<SiteTotalsBreakdown> {
  const [row, liveAgg] = await Promise.all([
    // Singleton lookup — row is seeded at id=1. The upsert path on first read
    // keeps the home page rendering even if the seed script was never run.
    prisma.siteStat.upsert({
      where: { id: 1 },
      create: { id: 1, donationCount: 4505, raisedAmount: 16112720 },
      update: {},
      select: { donationCount: true, raisedAmount: true },
    }),
    prisma.donation.aggregate({
      where: { status: "APPROVED", createdAt: { gte: LIVE_TOTALS_FROM } },
      _count: { _all: true },
      _sum: { amount: true },
    }),
  ]);
  const live = { donationCount: liveAgg._count._all, raisedAmount: liveAgg._sum.amount ?? 0 };
  return {
    legacy: row,
    live,
    total: formatTotals(row.donationCount + live.donationCount, row.raisedAmount + live.raisedAmount),
  };
}

export async function getSiteTotals(): Promise<SiteTotals> {
  return (await getSiteTotalsBreakdown()).total;
}

// Every public page that renders the site totals. Call after a donation is
// approved or the legacy figures change so the new numbers show immediately.
export function revalidateSiteTotals() {
  revalidatePath("/");
  revalidatePath("/who-we-are");
  revalidatePath("/success-stories");
}

export function formatTotals(donationCount: number, raisedAmount: number): SiteTotals {
  return {
    donationCount,
    raisedAmount,
    donationCountLabel: donationCount.toLocaleString("en-IN"),
    raisedAmountLabel:  `₹${raisedAmount.toLocaleString("en-IN")}`,
    raisedShortLabel:   formatCrores(raisedAmount),
  };
}

// "₹1.61 crores" / "₹85.4 lakhs" / "₹64,000" — pick the unit that fits.
function formatCrores(amount: number): string {
  if (amount >= 10_000_000) {
    const cr = amount / 10_000_000;
    return `₹${cr.toFixed(cr >= 10 ? 1 : 2)} crores`;
  }
  if (amount >= 100_000) {
    const lk = amount / 100_000;
    return `₹${lk.toFixed(lk >= 10 ? 1 : 2)} lakhs`;
  }
  return `₹${amount.toLocaleString("en-IN")}`;
}
