// Server-only data layer for causes — reads directly from Postgres so admin changes
// (publish / close / reopen / delete) reflect on the public site immediately after a
// revalidatePath() call from the relevant server action.

import { prisma } from "@/lib/prisma";

export type Update = { caption: string; body: string };

export type Campaign = {
  url: string;
  slug: string;
  title: string;
  goal: number;
  raised: number;
  status: "active" | "closed";
  image: string;
  summary: string;
  datePosted: string;
  updates: Update[];
};

export type Beneficiary = {
  key: string;
  beneficiary: string;
  campaigns: Campaign[];
  totalRaised: number;
  totalGoal: number;
  hasActive: boolean;
};

function mapStatus(s: string): "active" | "closed" {
  return s === "PUBLISHED" ? "active" : "closed";
}

// Map of accepted month names (long + short, lowercase) → 1-based month number.
const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

// Extract a date from a CauseUpdate caption. Handles the variants seen in
// the imported timeline entries:
//
//   "June 30, 2017 - …"      → 2017-06-30
//   "Mar 18, 2019 - …"       → 2019-03-18
//   "10-Nov-2020 - …"        → 2020-11-10
//   "1-Nov-2021 - …"         → 2021-11-01
//   "September 12, 2024 - …" → 2024-09-12
//
// Returns "" when no parseable date is present (e.g. "Fund Raising Closed").
// The output is an ISO-8601 date string so lexicographic comparison sorts
// chronologically.
function parseCaptionDate(caption: string): string {
  if (!caption) return "";
  // Form A: "Mon D, YYYY" or "Month DD, YYYY". Capture month name + day + year.
  const a = caption.match(/\b([A-Za-z]{3,9})\s+(\d{1,2}),\s*(\d{4})\b/);
  if (a) {
    const mm = MONTHS[a[1].toLowerCase()];
    if (mm) return toIso(Number(a[3]), mm, Number(a[2]));
  }
  // Form B: "D-Mon-YYYY" or "DD-Month-YYYY" with hyphen separators.
  const b = caption.match(/\b(\d{1,2})[-\s]([A-Za-z]{3,9})[-\s](\d{4})\b/);
  if (b) {
    const mm = MONTHS[b[2].toLowerCase()];
    if (mm) return toIso(Number(b[3]), mm, Number(b[1]));
  }
  return "";
}

function toIso(y: number, m: number, d: number): string {
  if (!y || !m || !d) return "";
  if (m < 1 || m > 12 || d < 1 || d > 31) return "";
  return `${y.toString().padStart(4, "0")}-${m.toString().padStart(2, "0")}-${d.toString().padStart(2, "0")}`;
}

/**
 * Fetch all PUBLISHED + CLOSED causes from the database, grouped by beneficiaryKey
 * so multiple campaigns for the same person nest together. DRAFT causes are hidden
 * from the public site entirely.
 */
async function loadGrouped(): Promise<Beneficiary[]> {
  const rows = await prisma.cause.findMany({
    where: { status: { in: ["PUBLISHED", "CLOSED"] } },
    include: { updates: { orderBy: { sortOrder: "asc" } } },
    orderBy: { updatedAt: "desc" },
  });

  const groups = new Map<string, Beneficiary>();
  for (const c of rows) {
    const key = c.beneficiaryKey || c.slug;
    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        beneficiary: c.title,
        campaigns: [],
        totalRaised: 0,
        totalGoal: 0,
        hasActive: false,
      };
      groups.set(key, g);
    }
    // The Cause.startDate captures when the campaign first launched, but
    // legacy WordPress causes often ran for years and we want the card to
    // reflect the most recent activity — admins were entering successive
    // fund requests as timeline entries with dates baked into the caption.
    // Parse those out and take the latest as the display date when it's
    // newer than startDate. Falls back to startDate (or createdAt) when no
    // caption yields a parseable date.
    const startIso = c.startDate?.toISOString().slice(0, 10) ?? c.createdAt.toISOString().slice(0, 10);
    let latestCaptionIso = "";
    for (const u of c.updates) {
      const iso = parseCaptionDate(u.caption ?? "");
      if (iso && iso > latestCaptionIso) latestCaptionIso = iso;
    }
    const datePosted = latestCaptionIso > startIso ? latestCaptionIso : startIso;

    g.campaigns.push({
      url: `/donations/${c.slug}`,
      slug: c.slug,
      title: c.title,
      goal: c.goalAmount,
      raised: c.raisedAmount,
      status: mapStatus(c.status),
      image: c.featuredImage ?? "",
      summary: c.summary ?? "",
      datePosted,
      updates: c.updates.map((u) => ({ caption: u.caption ?? "", body: u.body })),
    });
    g.totalRaised += c.raisedAmount;
    g.totalGoal += c.goalAmount;
    if (c.status === "PUBLISHED") g.hasActive = true;
  }

  // Sort each beneficiary's campaigns chronologically (oldest first)
  for (const g of groups.values()) {
    g.campaigns.sort((a, b) => (a.datePosted || "").localeCompare(b.datePosted || ""));
  }

  // Active beneficiaries first; within each tier, newest campaign first
  // (by the latest datePosted across the beneficiary's campaigns). Key
  // breaks ties for stability when two beneficiaries share a date.
  return [...groups.values()].sort((a, b) => {
    if (a.hasActive !== b.hasActive) return a.hasActive ? -1 : 1;
    const aLatest = a.campaigns.reduce((m, c) => c.datePosted > m ? c.datePosted : m, "");
    const bLatest = b.campaigns.reduce((m, c) => c.datePosted > m ? c.datePosted : m, "");
    if (aLatest !== bLatest) return bLatest.localeCompare(aLatest); // desc
    return a.key.localeCompare(b.key);
  });
}

// "support-microcharity" is the unrestricted-giving page — it should be reachable
// at its direct URL (and via findCampaign, used by /donations/[slug]) but kept out
// of every public listing (Current causes, Success stories, the home page).
const HIDDEN_FROM_LISTINGS = new Set(["support-microcharity"]);

function withoutHidden(all: Beneficiary[]): Beneficiary[] {
  return all
    .map((b) => ({ ...b, campaigns: b.campaigns.filter((c) => !HIDDEN_FROM_LISTINGS.has(c.slug)) }))
    .filter((b) => b.campaigns.length > 0);
}

export async function getBeneficiaries(): Promise<Beneficiary[]> {
  return withoutHidden(await loadGrouped());
}

export async function getActiveBeneficiaries(): Promise<Beneficiary[]> {
  return withoutHidden(await loadGrouped()).filter((b) => b.hasActive);
}

export async function getClosedBeneficiaries(): Promise<Beneficiary[]> {
  return withoutHidden(await loadGrouped()).filter((b) => !b.hasActive);
}

export async function getAllCampaigns(): Promise<Campaign[]> {
  return withoutHidden(await loadGrouped()).flatMap((b) => b.campaigns);
}

export function headlineCampaign(b: Beneficiary): Campaign {
  return b.campaigns.find((c) => c.status === "active") ?? b.campaigns[b.campaigns.length - 1];
}

export async function findCampaign(
  slug: string
): Promise<{ campaign: Campaign; beneficiary: Beneficiary } | null> {
  const all = await loadGrouped();
  for (const b of all) {
    const c = b.campaigns.find((c) => c.slug === slug);
    if (c) return { campaign: c, beneficiary: b };
  }
  return null;
}

// Build a plain-text excerpt for social/link previews (Open Graph / Twitter) and
// meta descriptions. Most causes have an empty `summary` — the narrative lives in
// the timeline entries — so we fall back to the first paragraph of the first
// (earliest) entry, which is exactly what a visitor reads at the top of the page.
// Markdown-style links are reduced to their label and whitespace is collapsed;
// the result is truncated on a word boundary.
export function causeExcerpt(
  campaign: Pick<Campaign, "summary" | "updates" | "title">,
  maxLen = 200
): string {
  const source =
    (campaign.summary && campaign.summary.trim()) ||
    firstParagraph(campaign.updates?.[0]?.body ?? "") ||
    "";
  const plain = source
    // [label](https://url) -> label
    .replace(/\[([^\]]+)\]\((?:https?:\/\/)?[^\s)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  if (!plain) {
    // Last-resort: a generic but useful line so previews aren't blank.
    return `Support "${campaign.title}" on MicroCharity — every contribution helps.`;
  }
  return truncate(plain, maxLen);
}

function firstParagraph(body: string): string {
  return body
    .split(/\r?\n\r?\n/)
    .map((p) => p.trim())
    .find((p) => p.length > 0) ?? body.trim();
}

function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  const clipped = s.slice(0, maxLen);
  const lastSpace = clipped.lastIndexOf(" ");
  return `${(lastSpace > maxLen * 0.6 ? clipped.slice(0, lastSpace) : clipped).trimEnd()}…`;
}

export async function getGrandTotalRaised(): Promise<number> {
  const r = await prisma.cause.aggregate({
    where: { status: { in: ["PUBLISHED", "CLOSED"] } },
    _sum: { raisedAmount: true },
  });
  return r._sum.raisedAmount ?? 0;
}
