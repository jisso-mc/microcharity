import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { audit } from "@/lib/audit";
import { isPlainEmail, sendApplicationBackup } from "@/lib/email";
import { buildApplicationPdf, applicationBackupSubject, applicationBackupFilename } from "@/lib/application-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET  /api/admin/forms/[id]/pdf          → download the backup PDF
// POST /api/admin/forms/[id]/pdf {to}     → email the backup PDF to `to`
//
// The PDF is the whole application (bank details included) followed by the
// uploaded documents. ADMIN role only, and only once the application is APPROVED.

async function load(id: string) {
  const me = await getCurrentUser();
  if (!me) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (me.role !== "ADMIN") return { error: NextResponse.json({ error: "Only admins can export applications." }, { status: 403 }) };
  const app = await prisma.causeApplication.findUnique({ where: { id } });
  if (!app) return { error: NextResponse.json({ error: "Application not found" }, { status: 404 }) };
  if (app.status !== "APPROVED") {
    return { error: NextResponse.json({ error: "Approve the application before exporting the PDF." }, { status: 409 }) };
  }
  return { me, app };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await load(id);
  if ("error" in r) return r.error;

  const pdf = await buildApplicationPdf(r.app);
  await audit({ action: "application.backup.download", userId: r.me.userId, entityType: "CauseApplication", entityId: id });
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${applicationBackupFilename(r.app)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await load(id);
  if ("error" in r) return r.error;

  const body = (await req.json().catch(() => ({}))) as { to?: string };
  const to = String(body.to ?? "").trim();
  if (!isPlainEmail(to)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });

  const pdf = await buildApplicationPdf(r.app);
  const subject = applicationBackupSubject(r.app);
  const sent = await sendApplicationBackup({
    to,
    subject,
    applicationNo: r.app.applicationNo,
    applicantName: r.app.fullName,
    pdf,
    filename: applicationBackupFilename(r.app),
  });
  if (!sent.ok) {
    console.error("[admin/forms/pdf] backup email failed", sent.reason);
    return NextResponse.json({ error: `Email failed: ${sent.reason}` }, { status: 502 });
  }

  await audit({
    action: "application.backup.email",
    userId: r.me.userId,
    entityType: "CauseApplication",
    entityId: id,
    payload: { to, sizeKb: Math.round(pdf.length / 1024) },
  });
  return NextResponse.json({ ok: true, subject });
}
