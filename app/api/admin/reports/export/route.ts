import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { getCurrentUser } from "@/lib/session";
import { audit } from "@/lib/audit";
import {
  resolveRange, donationSummary, perCauseBreakdown, topDonors, pendingDonations, receiptAudit, inr,
} from "@/lib/reports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/admin/reports/export?report=summary|causes|donors|pending|receipts
//     &fy=YYYY-YY | &fy=all | &from=YYYY-MM-DD&to=YYYY-MM-DD
//     &format=csv|pdf   (pdf only supported for report=summary)
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const report = (searchParams.get("report") ?? "summary").trim();
  const format = (searchParams.get("format") ?? "csv").trim().toLowerCase();
  const resolved = resolveRange(
    { fy: searchParams.get("fy") ?? undefined, from: searchParams.get("from") ?? undefined, to: searchParams.get("to") ?? undefined },
    new Date()
  );
  const { range, label } = resolved;
  const tag = (resolved.fy && resolved.fy !== "custom" ? resolved.fy : `${resolved.from}_to_${resolved.to}`) || "range";

  await audit({
    action: "donation.export",
    userId: user.userId,
    entityType: "Report",
    payload: { report, format, range: label },
  });

  if (format === "pdf") {
    if (report !== "summary") {
      return NextResponse.json({ error: "PDF is only available for the summary report; use CSV for others." }, { status: 400 });
    }
    const pdf = await buildSummaryPdf(range, label);
    return new NextResponse(pdf as unknown as ArrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="report_summary_${tag}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const csv = await buildCsv(report, range);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="report_${report}_${tag}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

// ---------- CSV ----------

const esc = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (headers: string[], rows: (string | number)[][]) =>
  // BOM so Excel opens UTF-8 (₹ etc.) correctly.
  "﻿" + [headers, ...rows].map((r) => r.map(esc).join(",")).join("\r\n") + "\r\n";
const day = (d: Date) => d.toISOString().slice(0, 10);

async function buildCsv(report: string, range: Parameters<typeof donationSummary>[0]): Promise<string> {
  switch (report) {
    case "summary": {
      const s = await donationSummary(range);
      const rows: (string | number)[][] = [
        ["Approved amount", s.approvedAmount],
        ["Approved donations", s.approvedCount],
        ["Pending amount", s.pendingAmount],
        ["Pending donations", s.pendingCount],
        ["Total donations (all statuses)", s.totalCount],
        ["Unique donors (approved)", s.uniqueDonors],
        [],
        ["By status", "count", "amount"],
        ...s.byStatus.map((x) => [x.status, x.count, x.amount]),
        [],
        ["By type (approved)", "count", "amount"],
        ...s.byType.map((x) => [x.type, x.count, x.amount]),
      ];
      return toCsv(["Metric", "Value", ""], rows);
    }
    case "causes": {
      const rows = await perCauseBreakdown(range);
      return toCsv(
        ["Cause", "MC ID", "Slug", "Approved donations", "Approved amount"],
        rows.map((c) => [c.title, c.mcId ?? "", c.slug, c.count, c.amount])
      );
    }
    case "donors": {
      const rows = await topDonors(range, 100000);
      return toCsv(
        ["Donor", "Email", "Approved donations", "Approved amount"],
        rows.map((d) => [d.name, d.email, d.count, d.amount])
      );
    }
    case "pending": {
      const rows = await pendingDonations(range);
      return toCsv(
        ["Created", "Donor", "Email", "Cause", "Type", "Amount"],
        rows.map((p) => [day(p.createdAt), p.donorName, p.donorEmail, p.causeTitle, p.type, p.amount])
      );
    }
    case "receipts": {
      const a = await receiptAudit(range);
      const rows: (string | number)[][] = [
        ["Approved donations", a.approvedCount],
        ["With receipt", a.withReceipt],
        ["Receipt emailed", a.receiptSent],
        ["Missing receipt", a.missingReceipt.length],
        ["Receipt not emailed", a.notSent.length],
        [],
        ["MISSING RECEIPT — Created", "Donor", "Email", "Cause", "Amount"],
        ...a.missingReceipt.map((m) => [day(m.createdAt), m.donorName, m.donorEmail, m.causeTitle, m.amount]),
        [],
        ["RECEIPT NOT EMAILED — Receipt #", "Donor", "Email", "Amount"],
        ...a.notSent.map((n) => [n.receiptNumber, n.donorName, n.donorEmail, n.amount]),
      ];
      return toCsv(["", "", "", "", ""], rows);
    }
    default:
      return toCsv(["error"], [["Unknown report: " + report]]);
  }
}

// ---------- PDF (summary) ----------

async function buildSummaryPdf(range: Parameters<typeof donationSummary>[0], label: string): Promise<Uint8Array> {
  const s = await donationSummary(range);
  const causes = await perCauseBreakdown(range);

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page = doc.addPage([595, 842]); // A4 portrait
  const M = 50;
  let y = 792;
  const ink = rgb(0.11, 0.1, 0.1);
  const muted = rgb(0.42, 0.39, 0.39);
  const accent = rgb(0.8, 0.13, 0.13);

  const ensure = (need: number) => { if (y - need < M) { page = doc.addPage([595, 842]); y = 792; } };
  const text = (t: string, x: number, size: number, f = font, color = ink) => { page.drawText(t, { x, y, size, font: f, color }); };
  const line = (t: string, size = 11, f = font, color = ink, dx = 0) => { ensure(size + 6); text(t, M + dx, size, f, color); y -= size + 6; };
  const gap = (h = 10) => { y -= h; };

  text("MicroCharity", M, 12, bold, accent); y -= 18;
  text("Donation Summary Report", M, 20, bold, ink); y -= 26;
  text(label, M, 11, font, muted); y -= 24;

  line("Headline", 13, bold);
  line(`Approved amount:      ${inr(s.approvedAmount)}   (${s.approvedCount} donations)`);
  line(`Pending amount:       ${inr(s.pendingAmount)}   (${s.pendingCount} donations)`);
  line(`Total donations:      ${s.totalCount}`);
  line(`Unique donors:        ${s.uniqueDonors}`);
  gap();

  line("By status", 13, bold);
  for (const x of s.byStatus) line(`${x.status.padEnd(12)}  ${String(x.count).padStart(5)}   ${inr(x.amount)}`);
  gap();

  line("By type (approved)", 13, bold);
  for (const x of s.byType) line(`${x.type.padEnd(12)}  ${String(x.count).padStart(5)}   ${inr(x.amount)}`);
  gap();

  line(`Per-cause breakdown (${causes.length} cause${causes.length === 1 ? "" : "s"})`, 13, bold);
  line(`${"Cause".padEnd(42)} ${"Don.".padStart(5)}  Amount`, 9, bold, muted);
  for (const c of causes) {
    const name = (c.title.length > 40 ? c.title.slice(0, 39) + "…" : c.title).padEnd(42);
    line(`${name} ${String(c.count).padStart(5)}  ${inr(c.amount)}`, 9);
  }

  ensure(30); y -= 6;
  text(`Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC · figures cover APPROVED donations by record date`, M, 8, font, muted);

  return doc.save();
}
