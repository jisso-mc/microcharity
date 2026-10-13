// Export every Cause in the DB to an Excel workbook with the columns the trust needs
// for reporting — title, launch date, beneficiary, location, approved amount, and the
// live public URL.
//
// Run:
//   node --env-file=.env.local scripts/export-causes-list.mjs
//
// Output: exports/causes-list-<YYYY-MM-DD>.xlsx (plus a .csv twin alongside it)
//
// Derivations (the DB doesn't store these directly):
//
//  * First published date — Cause.startDate, the field the app itself treats as the
//    campaign launch date. It's reliable for all but nine legacy rows: a follow-up
//    cause created via "Duplicate" copies every prior timeline entry across, and
//    scripts/backfill-cause-startdate.mjs read the FIRST caption, so a few rounds
//    inherited their beneficiary's original date instead of their own. Those rows are
//    detectable (a startDate shared with a sibling round) and get called out in the
//    "Data Note" column rather than silently guessed at — no timeline rule recovers
//    the right date for all of them, because some of those pages carry no entry of
//    their own. The First / Latest Timeline Entry columns give the raw dates so the
//    real launch date can be judged by eye.
//
//  * Beneficiary name — parsed out of the title ("Nursing College Fee for Christo" →
//    "Christo"), with the trailing round suffix ("– June 2021") stripped first. A small
//    override map covers the titles that don't fit the "... for <Name>" shape.
//
//  * Location — Cause.location is only populated for the two newest causes. For the
//    rest it lives in the first timeline caption:
//    "Oct 1, 2012 - Kochuthovala, Kattappana, Kerala (MCID-111-12)".
//
//  * Amount approved — Cause.goalAmount, which is what the timeline bodies record as
//    "MicroCharity approves fund request of Rs. X".

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { PrismaClient } from "@prisma/client";

const SITE = "https://www.microcharity.com";
const prisma = new PrismaClient();

const MONTHS = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
  dec: 12, december: 12,
};

function iso(y, m, d) {
  if (!y || !m || !d || m < 1 || m > 12 || d < 1 || d > 31) return "";
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// Same two caption shapes lib/data/causes.ts handles: "Mon D, YYYY" and "D-Mon-YYYY".
function parseCaptionDate(caption) {
  if (!caption) return "";
  const a = caption.match(/\b([A-Za-z]{3,9})\s+(\d{1,2}),\s*(\d{4})\b/);
  if (a && MONTHS[a[1].toLowerCase()]) return iso(+a[3], MONTHS[a[1].toLowerCase()], +a[2]);
  const b = caption.match(/\b(\d{1,2})[-\s]([A-Za-z]{3,9})[-\s](\d{4})\b/);
  if (b && MONTHS[b[2].toLowerCase()]) return iso(+b[3], MONTHS[b[2].toLowerCase()], +b[1]);
  return "";
}

// Titles that don't follow "<purpose> for <Name>".
const NAME_OVERRIDES = {
  "Help Shanil get back to Business!": "Shanil",
  "Help Thomas build a House": "Thomas",
  "Support MicroCharity": "MicroCharity (general fund)",
  "JCI India : Project KAVAJ (Protection) – Donate Vaccine, to save Life!": "JCI India (Project KAVAJ)",
  "Charity Initiatives – Junior Chamber International, Nalukody, Kerala": "JCI Nalukody, Kerala",
  "Tree Plantation Drive by JCI Nalukody": "JCI Nalukody, Kerala",
};

function beneficiaryName(title) {
  if (NAME_OVERRIDES[title]) return NAME_OVERRIDES[title];
  // Drop the round suffix: "… – June 2021", "… - Quarter 1, 2024".
  const base = title
    .replace(/\s+[–—-]\s+(Quarter\s*\d.*|[A-Za-z]+\s+\d{4}|\d{4})\s*$/i, "")
    .trim();
  if (NAME_OVERRIDES[base]) return NAME_OVERRIDES[base];
  const forMatch = base.match(/\bfor\s+(.+)$/i);
  if (forMatch) return forMatch[1].trim();
  // "Brain Surgery complication – Albin"
  const dashMatch = base.match(/\s+[–—-]\s+(.+)$/);
  if (dashMatch) return dashMatch[1].trim();
  return base;
}

// The first caption carries the location: "<date> - <Location> (MCID-…)".
function locationFromCaption(caption) {
  if (!caption) return "";
  const original = caption.trim();
  let s = original;
  s = s.replace(/\s*\((?:MCID|MC)[^)]*\)\s*$/i, "");         // trailing "(MCID-111-12)"
  s = s.replace(/\s*[-–—]\s*MCID[-\d\s]*$/i, "");            // or unbracketed "- MCID-107-19-20"
  s = s.replace(/^[A-Za-z]{3,9}\s+\d{1,2},\s*\d{4}\s*[-–—]\s*/, ""); // "Mon D, YYYY - "
  s = s.replace(/^\d{1,2}[-\s][A-Za-z]{3,9}[-\s]\d{4}\s*[-–—]\s*/, ""); // "D-Mon-YYYY - "
  s = s.trim();
  if (!s || s === original) return "";
  // A caption body that reads like an event ("Fund Raising for Quarter 2, 2013",
  // "MicroCharity approves the fund request") is not a place.
  if (/fund|micro\s*charity|approv|clos|rais|quarter|update|receiv|transfer|donat/i.test(s)) return "";
  return s;
}

const rows = await prisma.cause.findMany({
  include: { updates: { orderBy: { sortOrder: "asc" } } },
});

// Flag causes whose startDate is shared with a sibling round for the same
// beneficiary. Rounds launch on different dates by definition, so a shared value is
// the backfill's fallback showing through rather than a real launch date.
const startDateSharedWithSibling = new Set(); // cause.id
{
  const groups = new Map();
  for (const c of rows) {
    const key = c.beneficiaryKey || c.slug;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }
  for (const causes of groups.values()) {
    const byDate = new Map();
    for (const c of causes) {
      const d = (c.startDate ?? c.createdAt).toISOString().slice(0, 10);
      if (!byDate.has(d)) byDate.set(d, []);
      byDate.get(d).push(c);
    }
    for (const sharing of byDate.values()) {
      if (sharing.length > 1) for (const c of sharing) startDateSharedWithSibling.add(c.id);
    }
  }
}

const records = rows.map((c) => {
  const published = (c.startDate ?? c.createdAt).toISOString().slice(0, 10);

  // Timeline dates for this page. Follow-up causes copy their predecessor's entries
  // across, so `firstEntry` is when the beneficiary was first supported (not
  // necessarily when this round opened) and `lastEntry` is this round's latest note.
  const entryDates = c.updates
    .map((u) => parseCaptionDate(u.caption ?? ""))
    .filter(Boolean)
    .sort();

  const location =
    c.location?.trim() ||
    locationFromCaption(c.updates[0]?.caption ?? "") ||
    c.updates.map((u) => locationFromCaption(u.caption ?? "")).find(Boolean) ||
    "";

  return {
    mcId: c.mcId ?? "",
    title: c.title,
    published,
    beneficiary: beneficiaryName(c.title),
    location,
    approved: c.goalAmount,
    raised: c.raisedAmount,
    donors: c.donorCount,
    status: c.status,
    firstEntry: entryDates[0] ?? "",
    lastEntry: entryDates.at(-1) ?? "",
    note: startDateSharedWithSibling.has(c.id)
      ? "Launch date unreliable — shared with another round for this beneficiary"
      : "",
    url: `${SITE}/donations/${c.slug}`,
  };
});

records.sort((a, b) => a.published.localeCompare(b.published) || a.title.localeCompare(b.title));

const COLUMNS = [
  { header: "MCID", key: "mcId", width: 16 },
  { header: "Cause Title", key: "title", width: 46 },
  { header: "First Published", key: "published", width: 16 },
  { header: "Beneficiary Name", key: "beneficiary", width: 28 },
  { header: "Location", key: "location", width: 32 },
  { header: "Amount Approved (INR)", key: "approved", width: 21 },
  { header: "Amount Raised (INR)", key: "raised", width: 19 },
  { header: "Donors", key: "donors", width: 9 },
  { header: "Status", key: "status", width: 12 },
  { header: "First Timeline Entry", key: "firstEntry", width: 19 },
  { header: "Latest Timeline Entry", key: "lastEntry", width: 20 },
  { header: "Live URL", key: "url", width: 62 },
  { header: "Data Note", key: "note", width: 60 },
];

const wb = new ExcelJS.Workbook();
wb.creator = "MicroCharity admin export";
const ws = wb.addWorksheet("Causes", { views: [{ state: "frozen", ySplit: 1 }] });
ws.columns = COLUMNS;

const header = ws.getRow(1);
header.font = { bold: true, color: { argb: "FFFFFFFF" } };
header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E5F" } };
header.alignment = { vertical: "middle" };
header.height = 22;

for (const r of records) {
  const row = ws.addRow(r);
  row.getCell("approved").numFmt = "#,##0";
  row.getCell("raised").numFmt = "#,##0";
  const urlCell = row.getCell("url");
  urlCell.value = { text: r.url, hyperlink: r.url };
  urlCell.font = { color: { argb: "FF0563C1" }, underline: true };
}

ws.autoFilter = { from: "A1", to: { row: 1, column: COLUMNS.length } };

const total = ws.addRow({
  title: `TOTAL — ${records.length} causes`,
  approved: records.reduce((s, r) => s + r.approved, 0),
  raised: records.reduce((s, r) => s + r.raised, 0),
  donors: records.reduce((s, r) => s + r.donors, 0),
});
total.font = { bold: true };
total.getCell("approved").numFmt = "#,##0";
total.getCell("raised").numFmt = "#,##0";
total.border = { top: { style: "thin" } };

const stamp = new Date().toISOString().slice(0, 10);
const outDir = path.join(process.cwd(), "exports");
mkdirSync(outDir, { recursive: true });

const xlsxPath = path.join(outDir, `causes-list-${stamp}.xlsx`);
await wb.xlsx.writeFile(xlsxPath);

const csvEsc = (v) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = [
  COLUMNS.map((c) => csvEsc(c.header)).join(","),
  ...records.map((r) => COLUMNS.map((c) => csvEsc(r[c.key])).join(",")),
].join("\n");
const csvPath = path.join(outDir, `causes-list-${stamp}.csv`);
writeFileSync(csvPath, csv, "utf8");

console.log(`${records.length} causes written`);
console.log(xlsxPath);
console.log(csvPath);

const missing = records.filter((r) => !r.location);
if (missing.length) {
  console.log(`\nno location derivable (${missing.length}):`);
  for (const m of missing) console.log("  -", m.title, "|", m.url);
}

const flagged = records.filter((r) => r.note);
if (flagged.length) {
  console.log(`\nlaunch date shared with a sibling round — needs a manual fix (${flagged.length}):`);
  for (const f of flagged) console.log(`  - ${f.published}  ${f.title}  ${f.url}`);
}

await prisma.$disconnect();
