// MicroCharity ID generator — replicates the live site's "MCID-105-24-25" format.
// Format: MCID-{sequence}-{fyShort}
//   sequence  — starts at 101 each financial year, increments by one
//   fyShort   — Indian FY shorthand "YY-YY+1", e.g. "24-25" for Apr 2024–Mar 2025
//
// The 101 floor matches Jisso's convention: every new FY should open with
// MCID-101-… rather than MCID-1-…. If an FY already has IDs above 100,
// the next number is simply max+1 as before.

import type { Prisma } from "@prisma/client";

/** Indian financial year short label for a given date (FY runs Apr–Mar). */
export function fyShort(date = new Date()): string {
  const m = date.getMonth(); // 0=Jan, 11=Dec
  const y = date.getFullYear();
  const startYear = m >= 3 ? y : y - 1; // April (month index 3) onwards starts new FY
  const a = String(startYear).slice(-2);
  const b = String(startYear + 1).slice(-2);
  return `${a}-${b}`;
}

// Floor the sequence so the first ID of any FY is at least 101. Avoids
// MCID-1-YY-YY when a new financial year opens with no prior entries.
const SEQUENCE_FLOOR = 101;

/** Returns the next sequence number for the given FY by scanning existing MCIDs in both Cause and CauseUpdate. */
export async function nextMcId(
  tx: Prisma.TransactionClient,
  date = new Date()
): Promise<string> {
  const fy = fyShort(date);
  const suffix = `-${fy}`;

  const [causes, updates] = await Promise.all([
    tx.cause.findMany({
      where: { mcId: { endsWith: suffix } },
      select: { mcId: true },
    }),
    tx.causeUpdate.findMany({
      where: { mcId: { endsWith: suffix } },
      select: { mcId: true },
    }),
  ]);

  let max = 0;
  const re = /^MCID-(\d+)-/;
  for (const r of [...causes, ...updates]) {
    const m = r.mcId?.match(re);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  // Math.max() with the floor means an empty FY opens at 101, while a busy
  // FY that's already past 101 keeps its natural max+1 increment.
  const next = Math.max(max + 1, SEQUENCE_FLOOR);
  return `MCID-${next}-${fy}`;
}

/** Format a Date as "Mon DD, YYYY" — used to prefix timeline captions. */
export function formatPostedDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Build the human-readable caption for a timeline entry, matching the live site's pattern:
 *   "Sep 10, 2024 - Pala, Kerala (MCID-105-24-25)"
 *   "Jan 9, 2026 - Fund Request Approved (MCID-103-25-26)"
 *   "Sep 12, 2024 - Fund Request Approved"   (no MCID)
 */
export function composeCaption(parts: { date: Date; heading?: string; mcId?: string | null }): string {
  const bits: string[] = [formatPostedDate(parts.date)];
  if (parts.heading) bits.push(parts.heading.trim());
  let s = bits.join(" - ");
  if (parts.mcId) s += ` (${parts.mcId})`;
  return s;
}
