import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getReceiptPdfForDonation } from "@/lib/donations";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/donations/[id]/receipt
//
// Re-builds the 80G receipt PDF for an approved donation and returns it as a
// download. PDFs aren't stored (Receipt.pdfUrl is unused), so this renders on
// demand with the same receipt number + date the donor was emailed. Admin-only
// and never cached — the PDF carries the donor's decrypted PAN.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const result = await getReceiptPdfForDonation(id);
  if (!result) {
    return NextResponse.json({ error: "Receipt not available — donation not found or not approved" }, { status: 404 });
  }

  await audit({
    action: "donation.receipt.download",
    userId: user.userId,
    entityType: "Donation",
    entityId: id,
    payload: { receiptNumber: result.receiptNumber },
  });

  // "2025-26/14" → "MicroCharity-Receipt-2025-26-14.pdf"
  const filename = `MicroCharity-Receipt-${result.receiptNumber.replace(/[^A-Za-z0-9-]+/g, "-")}.pdf`;
  return new NextResponse(Buffer.from(result.pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
