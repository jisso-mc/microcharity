import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getCurrentUser } from "@/lib/session";
import { audit } from "@/lib/audit";
import { donorStatement, fyRange } from "@/lib/reports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/admin/reports/donor-statement?fy=YYYY-YY
//
// Downloads MC-DonationDetails-FY{YYYY-YY}.xlsx — one row per donor with their
// cumulative APPROVED donations in that financial year, for the trust's
// Income Tax Form 10BD filing. FY-only (no custom ranges): the filing is
// always per financial year.
//
// Contains decrypted PANs — admin-only and never cached.
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const fy = (new URL(req.url).searchParams.get("fy") ?? "").trim();
  const range = fyRange(fy);
  if (!range) {
    return NextResponse.json({ error: "Select a financial year (e.g. fy=2025-26)" }, { status: 400 });
  }

  const rows = await donorStatement(range);

  await audit({
    action: "donation.export",
    userId: user.userId,
    entityType: "Report",
    payload: { report: "donor-statement-10bd", fy, rows: rows.length },
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = "MicroCharity Admin";
  wb.created = new Date();
  const sheet = wb.addWorksheet(`FY ${fy}`);

  sheet.columns = [
    { header: "Sl. No",          key: "sl",      width: 8 },
    { header: "PAN No",          key: "pan",     width: 14 },
    { header: "Donor Name",      key: "name",    width: 30 },
    { header: "Address",         key: "address", width: 50 },
    { header: "Email",           key: "email",   width: 34 },
    { header: "Donation Amount", key: "amount",  width: 16 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  rows.forEach((r, i) => sheet.addRow({ sl: i + 1, ...r }));

  sheet.getColumn("amount").numFmt = "#,##0";
  sheet.getColumn("address").alignment = { wrapText: true, vertical: "top" };

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer as ArrayBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="MC-DonationDetails-FY${fy}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
