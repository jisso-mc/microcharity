// 80G donation receipt — number generator + PDF builder.
//
// Receipt number format: "{YYYY-YY}/{seq}" (e.g. "2024-25/49"), matching the
// new template from Finance. Sequence resets each Indian financial year.
//
// Legacy format "{seq} / {YYYY-YY}" (e.g. "236 / 2021-22") is still parsed by
// nextReceiptNumber when seeding the sequence so we don't reset to 1 after the
// format change — receipts already on the books are recognised.
//
// PDF layout mirrors the new Finance-issued template: logo top-left + large
// "DONATION RECEIPT" header top-right, trust info block, two-column donor/meta
// row, line-item table with header bar + total row, total-in-words, 80G
// disclosure, About block, signature block.

import fs from "node:fs";
import path from "node:path";
import {
  PDFDocument,
  PDFPage,
  StandardFonts,
  rgb,
  RGB,
  PDFFont,
} from "pdf-lib";
import type { Prisma } from "@prisma/client";
import { TRUST } from "./trust";

// ---------- Financial year helpers ----------

export function fyLong(date = new Date()): string {
  const m = date.getMonth();
  const y = date.getFullYear();
  const start = m >= 3 ? y : y - 1;
  return `${start}-${String(start + 1).slice(-2)}`;
}

export function fyShort(date = new Date()): string {
  const m = date.getMonth();
  const y = date.getFullYear();
  const start = m >= 3 ? y : y - 1;
  return `${String(start).slice(-2)}-${String(start + 1).slice(-2)}`;
}

// ---------- Receipt number ----------

export async function nextReceiptNumber(
  tx: Prisma.TransactionClient,
  forDate = new Date()
): Promise<string> {
  const fy = fyLong(forDate);
  // Find every receipt that references this FY in its number string — could be
  // either the new "FY/N" format or the legacy "N / FY" format. We tolerate both
  // so the FY-to-FY sequence is continuous even across the format change.
  const existing = await tx.receipt.findMany({
    where: { receiptNumber: { contains: fy } },
    select: { receiptNumber: true },
  });
  let max = 0;
  for (const r of existing) {
    // Strip the FY label and any non-digit; the remaining digit-run is the seq.
    const digits = r.receiptNumber.replace(fy, "").replace(/[^\d]/g, "");
    if (!digits) continue;
    const n = parseInt(digits, 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${fy}/${max + 1}`;
}

// ---------- Number to words (Indian system) ----------

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function under1000(n: number): string {
  if (n === 0) return "";
  if (n < 20) return ONES[n];
  if (n < 100) {
    const t = Math.floor(n / 10);
    const r = n % 10;
    return TENS[t] + (r ? " " + ONES[r] : "");
  }
  const h = Math.floor(n / 100);
  const r = n % 100;
  return ONES[h] + " Hundred" + (r ? " " + under1000(r) : "");
}

export function rupeesInWords(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "Zero";
  n = Math.floor(n);
  const parts: string[] = [];
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh  = Math.floor(n / 100000);   n %= 100000;
  const thou  = Math.floor(n / 1000);     n %= 1000;
  if (crore) parts.push(under1000(crore) + " Crore");
  if (lakh)  parts.push(under1000(lakh)  + " Lakh");
  if (thou)  parts.push(under1000(thou)  + " Thousand");
  if (n)     parts.push(under1000(n));
  return parts.join(" ");
}

// ---------- PDF builder ----------

// Palette matched to the new Finance template.
const INK       = rgb(0.11, 0.10, 0.10);
const BODY      = rgb(0.23, 0.22, 0.22);
const MUTED     = rgb(0.45, 0.42, 0.42);
const HAIRLINE  = rgb(0.85, 0.83, 0.81);
const TABLE_HEAD = rgb(0.18, 0.18, 0.20); // dark band behind the column headers
const TOTAL_BAND = rgb(0.94, 0.94, 0.94); // pale band behind the total row

const PAGE_W = 595.28; // A4
const PAGE_H = 841.89;
const M_LEFT = 50;
const M_RIGHT = PAGE_W - 50;

type Ctx = { page: PDFPage; helv: PDFFont; helvB: PDFFont; helvI: PDFFont; helvBI: PDFFont };

function drawText(ctx: Ctx, text: string, x: number, y: number, size: number, opts?: { bold?: boolean; italic?: boolean; color?: RGB }) {
  const color = opts?.color ?? INK;
  const font = opts?.italic
    ? (opts.bold ? ctx.helvBI : ctx.helvI)
    : (opts?.bold ? ctx.helvB : ctx.helv);
  ctx.page.drawText(text, { x, y, size, font, color });
}

function textRight(ctx: Ctx, text: string, rightX: number, y: number, size: number, opts?: { bold?: boolean; italic?: boolean; color?: RGB }) {
  const font = opts?.italic
    ? (opts.bold ? ctx.helvBI : ctx.helvI)
    : (opts?.bold ? ctx.helvB : ctx.helv);
  const w = font.widthOfTextAtSize(text, size);
  drawText(ctx, text, rightX - w, y, size, opts);
}

function loadAsset(filename: string): Buffer | null {
  try { return fs.readFileSync(path.join(process.cwd(), "public", filename)); }
  catch { return null; }
}

// dd/mm/yyyy per the new template.
function fmtDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear());
  return `${dd}/${mm}/${yy}`;
}

// Wrap a string at maxChars without breaking words mid-syllable.
function wrap(text: string, maxChars: number): string[] {
  if (!text) return [];
  if (text.length <= maxChars) return [text];
  const words = text.split(/\s+/);
  const out: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > maxChars) {
      if (cur) out.push(cur);
      cur = w;
    } else {
      cur = cur ? cur + " " + w : w;
    }
  }
  if (cur) out.push(cur);
  return out;
}

export type ReceiptPdfInput = {
  receiptNumber: string;       // e.g. "2024-25/49"
  receiptDate: Date;
  donorName: string;
  donorPan?: string | null;    // already decrypted by the caller
  causeTitle: string;          // shown as the line-item description
  causeMcId?: string | null;
  amount: number;              // INR rupees, integer
  paymentMode: string;         // e.g. "Bank Transfer - NEFT / IMPS / RTGS"
  paymentDate: Date;
};

export async function buildReceiptPdf(input: ReceiptPdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([PAGE_W, PAGE_H]);
  const helv  = await pdf.embedFont(StandardFonts.Helvetica);
  const helvB = await pdf.embedFont(StandardFonts.HelveticaBold);
  const helvI  = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const helvBI = await pdf.embedFont(StandardFonts.HelveticaBoldOblique);
  const ctx: Ctx = { page, helv, helvB, helvI, helvBI };

  // ---------- Top band: logo (left) + DONATION RECEIPT (right) ----------

  let cursorY = PAGE_H - 60;

  const logoBytes = loadAsset("logo.jpg");
  if (logoBytes) {
    try {
      const logo = await pdf.embedJpg(logoBytes);
      const logoW = 130;
      const ratio = logo.height / logo.width;
      const logoH = logoW * ratio;
      page.drawImage(logo, { x: M_LEFT, y: cursorY - logoH + 8, width: logoW, height: logoH });
    } catch { /* ignore */ }
  }

  // Right-stacked "DONATION" / "RECEIPT" header — large display weight, ranged right.
  textRight(ctx, "DONATION", M_RIGHT, cursorY - 4, 30, { bold: true });
  textRight(ctx, "RECEIPT",  M_RIGHT, cursorY - 36, 30, { bold: true });
  textRight(ctx, `# ${input.receiptNumber}`, M_RIGHT, cursorY - 56, 11, { bold: true });

  cursorY -= 110; // below the logo / header

  // ---------- Trust info block ----------

  drawText(ctx, TRUST.name, M_LEFT, cursorY, 11, { bold: true });
  cursorY -= 14;
  drawText(ctx, TRUST.address.line1, M_LEFT, cursorY, 9, { color: BODY });
  cursorY -= 12;
  drawText(ctx, `Email : ${TRUST.email} / ${TRUST.financeEmail}`, M_LEFT, cursorY, 9, { color: BODY });
  cursorY -= 12;
  drawText(ctx, `Web : ${TRUST.website}`, M_LEFT, cursorY, 9, { color: BODY });
  cursorY -= 12;
  drawText(ctx, `PAN : ${TRUST.pan}   CSR Reg No : ${TRUST.csrNumber}`, M_LEFT, cursorY, 9, { color: BODY });
  cursorY -= 26;

  // ---------- Donor + meta row ----------

  // Left: donor block.
  drawText(ctx, "Donations Received From", M_LEFT, cursorY, 9, { color: MUTED });
  drawText(ctx, input.donorName, M_LEFT, cursorY - 14, 11, { bold: true });
  if (input.donorPan) {
    drawText(ctx, `PAN : ${input.donorPan}`, M_LEFT, cursorY - 28, 9, { color: BODY });
  }

  // Right: donation date + payment mode block. Labels left-aligned within the
  // right column, values right-aligned at the page margin.
  const META_LABEL_X = PAGE_W - 240; // start of the meta block
  drawText(ctx, "Donation Date :", META_LABEL_X, cursorY, 9, { color: BODY });
  textRight(ctx, fmtDate(input.paymentDate), M_RIGHT, cursorY, 10);
  drawText(ctx, "Payment Mode :", META_LABEL_X, cursorY - 14, 9, { color: BODY });
  // Payment mode might be long — wrap to two lines at a comfortable width.
  const modeLines = wrap(input.paymentMode, 30);
  let modeY = cursorY - 14;
  for (const line of modeLines) {
    textRight(ctx, line, M_RIGHT, modeY, 10);
    modeY -= 12;
  }

  cursorY -= 60;

  // ---------- Line-item table ----------

  // Header band (dark) with white text.
  const headerH = 20;
  page.drawRectangle({ x: M_LEFT, y: cursorY - headerH, width: M_RIGHT - M_LEFT, height: headerH, color: TABLE_HEAD });
  drawText(ctx, "#",      M_LEFT + 10, cursorY - 14, 9, { color: rgb(1, 1, 1) });
  drawText(ctx, "Causes", M_LEFT + 36, cursorY - 14, 9, { color: rgb(1, 1, 1) });
  textRight(ctx, "Amount", M_RIGHT - 10, cursorY - 14, 9, { color: rgb(1, 1, 1) });

  // Row body
  cursorY -= headerH;
  const rowTop = cursorY;
  cursorY -= 6;
  drawText(ctx, "1", M_LEFT + 12, cursorY - 10, 10);
  // First line: bold "Donations" (the type), second line: cause title.
  drawText(ctx, "Donations", M_LEFT + 36, cursorY - 10, 10, { bold: true });
  drawText(ctx, input.causeTitle, M_LEFT + 36, cursorY - 24, 9, { color: BODY });
  textRight(ctx, formatRupees(input.amount), M_RIGHT - 10, cursorY - 10, 10);
  cursorY -= 38;
  // Hairline under the row
  page.drawLine({ start: { x: M_LEFT, y: cursorY + 4 }, end: { x: M_RIGHT, y: cursorY + 4 }, color: HAIRLINE, thickness: 0.7 });

  // Total band (light grey) — only the right portion of the table width.
  const totalBandX = PAGE_W - 240;
  const totalH = 22;
  page.drawRectangle({ x: totalBandX, y: cursorY - totalH + 4, width: M_RIGHT - totalBandX, height: totalH, color: TOTAL_BAND });
  drawText(ctx, "Total", totalBandX + 10, cursorY - totalH + 12, 10, { bold: true });
  textRight(ctx, `₹${formatRupees(input.amount)}`, M_RIGHT - 10, cursorY - totalH + 12, 11, { bold: true });
  cursorY -= totalH + 6;

  // Total in words — italic bold, right-aligned, label muted to the left.
  const words = `${rupeesInWords(input.amount)} Only`;
  // Some amounts wrap across two lines.
  const wordsFull = `Indian Rupee ${words}`;
  const wrapped = wrap(wordsFull, 32);
  drawText(ctx, "Total In Words :", PAGE_W - 320, cursorY, 9, { color: MUTED });
  let wy = cursorY;
  for (const ln of wrapped) {
    textRight(ctx, ln, M_RIGHT, wy, 10, { bold: true, italic: true });
    wy -= 14;
  }
  cursorY = wy - 30;

  // ---------- 80G disclosure ----------

  drawText(ctx, "80G Income Tax Exemption", M_LEFT, cursorY, 11);
  cursorY -= 16;
  const disclosure =
    `Donations to MicroCharity from 15-July-2014 qualify for deduction u/s 80G(5) of the ` +
    `Income Tax Act, 1961 as per 80G Exemption Vide Order No: ${TRUST.exemption80G}`;
  for (const line of wrap(disclosure, 110)) {
    drawText(ctx, line, M_LEFT, cursorY, 9, { color: BODY });
    cursorY -= 12;
  }
  cursorY -= 14;

  // ---------- About MicroCharity ----------

  drawText(ctx, "About MicroCharity", M_LEFT, cursorY, 11);
  cursorY -= 16;
  const aboutLines = [
    `MicroCharity is a registered Charitable Trust under Indian Trust Act with Registration Number: ${TRUST.trustRegistration}.`,
    `PAN No: ${TRUST.pan} | Ministry of Corporate Affairs CSR Registration Number: ${TRUST.csrNumber}`,
  ];
  for (const p of aboutLines) {
    for (const line of wrap(p, 110)) {
      drawText(ctx, line, M_LEFT, cursorY, 9, { color: BODY });
      cursorY -= 12;
    }
  }
  cursorY -= 18;

  // ---------- Signature block (bottom-left) ----------

  const sigBytes = loadAsset("receipt-signature.jpg");
  if (sigBytes) {
    try {
      const sig = await pdf.embedJpg(sigBytes);
      const sigW = 110;
      const sigRatio = sig.height / sig.width;
      const sigH = sigW * sigRatio;
      page.drawImage(sig, { x: M_LEFT, y: cursorY - sigH, width: sigW, height: sigH });
      cursorY -= sigH + 4;
    } catch { /* ignore */ }
  }
  drawText(ctx, TRUST.signatory.name, M_LEFT, cursorY, 10, { bold: true });
  drawText(ctx, TRUST.signatory.title, M_LEFT, cursorY - 12, 9, { color: BODY });

  // Page-number footer (tiny, bottom-right) to match the template.
  textRight(ctx, "1", M_RIGHT, 30, 8, { color: MUTED });

  return await pdf.save();
}

// Format an integer rupee amount with the Indian thousand-separator pattern but
// no currency symbol — the template prepends ₹ only in the total band.
function formatRupees(n: number): string {
  return `${n.toLocaleString("en-IN")}.00`;
}
