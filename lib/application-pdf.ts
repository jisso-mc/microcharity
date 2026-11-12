// Backup PDF of a cause application: the full form (every section, in display
// order) followed by the uploaded documents — PDF attachments are merged in page
// by page, JPG / PNG / WebP images get a page each. Formats pdf-lib can't embed
// (HEIC) or files that fail to download are listed with their link instead.
//
// Built in an /api route so public/fonts is bundled (next.config.ts →
// outputFileTracingIncludes). Contains bank details — admin-only.

import fs from "node:fs";
import path from "node:path";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { CauseApplication } from "@prisma/client";
import { FORM_TYPE_LABEL, type AttachmentMeta } from "./applications";
import { orderedSections, orderedFields, sectionLabel, fieldLabel, attachmentLabel, formTemplate } from "./application-fields";
import { fetchAttachment } from "./application-attachments";
import { TRUST } from "./trust";

const PAGE_W = 595.28;   // A4
const PAGE_H = 841.89;
const M = 48;
const INK = rgb(0.11, 0.1, 0.1);
const BODY = rgb(0.23, 0.22, 0.22);
const MUTED = rgb(0.42, 0.39, 0.39);
const ACCENT = rgb(0.8, 0.13, 0.13);
const LINE = rgb(0.9, 0.89, 0.87);

const STATUS_LABEL: Record<string, string> = {
  SUBMITTED: "Submitted", UNDER_REVIEW: "Under review", APPROVED: "Approved", REJECTED: "Rejected",
};

export const fmtDate = (d: Date) =>
  d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).replace(/ /g, "-");

class Writer {
  page!: PDFPage;
  y = 0;
  constructor(private pdf: PDFDocument, private reg: PDFFont, private bold: PDFFont, private chars: Set<number>) {
    this.newPage();
  }

  newPage() {
    this.page = this.pdf.addPage([PAGE_W, PAGE_H]);
    this.y = PAGE_H - M;
  }

  ensure(h: number) {
    if (this.y - h < M) this.newPage();
  }

  /** Replace characters the embedded font can't draw (e.g. Indic scripts) with "?". */
  clean(s: string): string {
    return Array.from(s.replace(/\r/g, "").replace(/\t/g, " "))
      .map((ch) => (ch === "\n" || this.chars.has(ch.codePointAt(0)!) ? ch : "?"))
      .join("");
  }

  wrap(text: string, font: PDFFont, size: number, width: number): string[] {
    const out: string[] = [];
    for (const para of this.clean(text).split("\n")) {
      const words = para.split(/ +/);
      let line = "";
      for (const w of words) {
        const next = line ? `${line} ${w}` : w;
        if (font.widthOfTextAtSize(next, size) <= width) { line = next; continue; }
        if (line) out.push(line);
        // Hard-break a single word that is wider than the line.
        let word = w;
        while (font.widthOfTextAtSize(word, size) > width && word.length > 1) {
          let cut = word.length - 1;
          while (cut > 1 && font.widthOfTextAtSize(word.slice(0, cut), size) > width) cut--;
          out.push(word.slice(0, cut));
          word = word.slice(cut);
        }
        line = word;
      }
      out.push(line);
    }
    return out;
  }

  text(s: string, opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; x?: number; width?: number; gap?: number } = {}) {
    const size = opts.size ?? 9.5;
    const font = opts.bold ? this.bold : this.reg;
    const x = opts.x ?? M;
    const lh = size * 1.4;
    for (const line of this.wrap(s, font, size, opts.width ?? PAGE_W - x - M)) {
      this.ensure(lh);
      this.page.drawText(line, { x, y: this.y - size, size, font, color: opts.color ?? BODY });
      this.y -= lh;
    }
    this.y -= opts.gap ?? 0;
  }

  heading(s: string) {
    this.ensure(40);
    this.y -= 10;
    this.text(s, { size: 12, bold: true, color: INK });
    this.page.drawLine({ start: { x: M, y: this.y + 2 }, end: { x: PAGE_W - M, y: this.y + 2 }, color: ACCENT, thickness: 1.2 });
    this.y -= 8;
  }

  /** "Label: value" row — label in a fixed left column, value wrapped on the right. */
  field(label: string, value: string, x = M) {
    const size = 9.5;
    const labelW = 150;
    const valueX = x + labelW;
    const lines = this.wrap(value || "—", this.reg, size, PAGE_W - valueX - M);
    const lh = size * 1.4;
    this.ensure(lh * Math.min(lines.length, 3));
    const labelLines = this.wrap(label, this.reg, 8.5, labelW - 8);
    const top = this.y;
    labelLines.forEach((l, i) => this.page.drawText(l, { x, y: top - 8.5 - i * 12, size: 8.5, font: this.reg, color: MUTED }));
    for (const line of lines) {
      this.ensure(lh);
      this.page.drawText(line, { x: valueX, y: this.y - size, size, font: this.reg, color: value ? INK : MUTED });
      this.y -= lh;
    }
    this.y = Math.min(this.y, top - labelLines.length * 12) - 3;
  }

  rule() {
    this.page.drawLine({ start: { x: M, y: this.y }, end: { x: PAGE_W - M, y: this.y }, color: LINE, thickness: 0.6 });
    this.y -= 6;
  }
}

function display(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "string" || typeof v === "number") return String(v);
  return JSON.stringify(v);
}

export async function buildApplicationPdf(app: CauseApplication): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const fontDir = path.join(process.cwd(), "public", "fonts");
  const reg = await pdf.embedFont(fs.readFileSync(path.join(fontDir, "NotoSans-Regular.ttf")), { subset: true });
  const bold = await pdf.embedFont(fs.readFileSync(path.join(fontDir, "NotoSans-Bold.ttf")), { subset: true });
  const chars = new Set([...reg.getCharacterSet(), ...bold.getCharacterSet()]);
  pdf.setTitle(`Application ${app.applicationNo} — ${app.fullName}`);
  pdf.setAuthor(TRUST.name);

  const w = new Writer(pdf, reg, bold, chars);

  // ---- Header ----
  w.text(TRUST.name.toUpperCase(), { size: 9, bold: true, color: ACCENT });
  w.text(`${FORM_TYPE_LABEL[app.formType]} Application Form`, { size: 18, bold: true, color: INK, gap: 4 });
  w.text(
    `Application No: ${app.applicationNo}   ·   Submitted: ${fmtDate(app.createdAt)}   ·   Status: ${STATUS_LABEL[app.status] ?? app.status}`,
    { size: 9.5, color: MUTED, gap: 4 },
  );
  w.text(`Applicant: ${app.fullName}   ·   Phone: ${app.phone}${app.email ? `   ·   Email: ${app.email}` : ""}`, { size: 9.5, color: MUTED, gap: 6 });
  w.rule();

  // ---- Every section of the form, blanks included ----
  // Walk the full template for this form type so the PDF shows the complete form
  // (validation drops blank optional fields, so the stored data alone would skip them).
  const data = (app.data as Record<string, unknown>) ?? {};
  const template = formTemplate(app.formType);
  const blank = (v: unknown) => v == null || v === "" ? "—" : display(v);

  for (const sec of template) {
    const value = data[sec.key];
    w.heading(sectionLabel(sec.key));
    if (sec.kind === "text") {
      w.text(blank(value), { color: value == null || value === "" ? MUTED : INK });
    } else if (sec.kind === "fields") {
      const obj = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
      const extra = Object.keys(obj).filter((k) => !sec.fields.includes(k));
      for (const k of [...sec.fields, ...extra]) w.field(fieldLabel(k), display(obj[k]));
    } else {
      const list = Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];
      if (list.length === 0) {
        w.text("No entries.", { color: MUTED });
        continue;
      }
      list.forEach((row, i) => {
        w.text(`${i + 1}.`, { bold: true, color: INK });
        for (const k of sec.fields) w.field(fieldLabel(k), display(row?.[k]), M + 12);
      });
    }
  }
  // Anything stored that the template doesn't know about (older form versions).
  const known = new Set(template.map((t) => t.key));
  for (const [key, value] of orderedSections(data).filter(([k]) => !known.has(k))) {
    w.heading(sectionLabel(key));
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const [k, v] of orderedFields(value as Record<string, unknown>)) w.field(fieldLabel(k), display(v));
    } else {
      w.text(display(value) || "—", { color: INK });
    }
  }

  // ---- Prepare the supporting documents (download + parse) ----
  const attachments = (app.attachmentMeta as AttachmentMeta[] | null) ?? [];
  type Img = Awaited<ReturnType<PDFDocument["embedPng"]>>;
  type Prepared =
    | { a: AttachmentMeta; label: string; kind: "pdf"; doc: PDFDocument }
    | { a: AttachmentMeta; label: string; kind: "img"; img: Img }
    | { a: AttachmentMeta; label: string; kind: "none" };
  const prepared: Prepared[] = await Promise.all(attachments.map(async (a): Promise<Prepared> => {
    const label = attachmentLabel(app.formType, a.field);
    const bytes = await fetchAttachment(a);
    if (!bytes) return { a, label, kind: "none" };
    try {
      if (a.mimeType === "application/pdf") return { a, label, kind: "pdf", doc: await PDFDocument.load(bytes, { ignoreEncryption: true }) };
      if (a.mimeType === "image/png") return { a, label, kind: "img", img: await pdf.embedPng(bytes) };
      if (a.mimeType === "image/jpeg") return { a, label, kind: "img", img: await pdf.embedJpg(bytes) };
      // pdf-lib only embeds JPG / PNG — convert anything else (WebP) to PNG first.
      const png = await toPng(bytes);
      if (png) return { a, label, kind: "img", img: await pdf.embedPng(png) };
    } catch (e) {
      console.error("[application-pdf] could not read attachment", a.url, e);
    }
    return { a, label, kind: "none" };
  }));

  // ---- "Supporting documents" index page, with the page each document starts on ----
  w.newPage();
  w.text("Supporting documents", { size: 16, bold: true, color: INK, gap: 4 });
  w.text(`Documents uploaded with application ${app.applicationNo}, in the order they follow.`, { size: 9.5, color: MUTED, gap: 8 });
  w.rule();
  if (prepared.length === 0) w.text("No documents were uploaded.", { color: MUTED });
  let nextPage = pdf.getPageCount() + 1;
  for (const p of prepared) {
    const pages = p.kind === "pdf" ? p.doc.getPageCount() : p.kind === "img" ? 1 : 0;
    const where = pages ? `page ${nextPage}${pages > 1 ? `–${nextPage + pages - 1}` : ""}` : "not included — see link below";
    w.field(p.label, `${p.a.filename} (${Math.round(p.a.size / 1024)} KB) — ${where}`);
    nextPage += pages;
  }
  const notEmbedded = prepared.filter((p) => p.kind === "none");
  if (notEmbedded.length) {
    w.y -= 6;
    w.text("These files could not be included in this PDF — open them from the links:", { size: 9, color: MUTED });
    for (const p of notEmbedded) w.text(`${p.label}: ${p.a.url ?? p.a.filename}`, { size: 8.5 });
  }
  const ownPages = pdf.getPageCount();

  // ---- Append the documents ----
  for (const p of prepared) {
    if (p.kind === "pdf") {
      try {
        const pages = await pdf.copyPages(p.doc, p.doc.getPageIndices());
        pages.forEach((pg) => pdf.addPage(pg));
      } catch (e) {
        console.error("[application-pdf] could not merge PDF", p.a.url, e);
      }
    } else if (p.kind === "img") {
      const page = pdf.addPage([PAGE_W, PAGE_H]);
      page.drawText(w.clean(`${p.label} — ${p.a.filename}`).slice(0, 110), { x: M, y: PAGE_H - M, size: 10, font: bold, color: INK });
      const maxW = PAGE_W - 2 * M;
      const maxH = PAGE_H - 2 * M - 24;
      const scale = Math.min(maxW / p.img.width, maxH / p.img.height, 1);
      page.drawImage(p.img, {
        x: M + (maxW - p.img.width * scale) / 2,
        y: M + (maxH - p.img.height * scale),
        width: p.img.width * scale,
        height: p.img.height * scale,
      });
    }
  }

  // Page numbers on the pages we drew (merged documents are left untouched).
  const total = pdf.getPageCount();
  pdf.getPages().slice(0, ownPages).forEach((pg, i) => {
    const label = `${app.applicationNo} · Page ${i + 1} of ${total}`;
    pg.drawText(label, { x: PAGE_W - M - reg.widthOfTextAtSize(label, 7.5), y: 24, size: 7.5, font: reg, color: MUTED });
  });

  return pdf.save();
}

/** Convert an image pdf-lib can't embed (e.g. WebP) to PNG. Null if sharp is unavailable. */
async function toPng(bytes: Buffer): Promise<Buffer | null> {
  try {
    const sharp = (await import("sharp")).default;
    return await sharp(bytes).png().toBuffer();
  } catch (e) {
    console.error("[application-pdf] image conversion failed", e);
    return null;
  }
}

/** "Application Form - Applicant Name - Cause Type - Date" (date = submission date). */
export function applicationBackupSubject(app: CauseApplication): string {
  return `Application Form - ${app.fullName} - ${FORM_TYPE_LABEL[app.formType]} - ${fmtDate(app.createdAt)}`;
}

export function applicationBackupFilename(app: CauseApplication): string {
  return `Application-${app.applicationNo.replace(/[^A-Za-z0-9-]+/g, "-")}-${app.fullName.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "")}.pdf`;
}
