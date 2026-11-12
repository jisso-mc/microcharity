"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ApplicationStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { audit } from "@/lib/audit";
import type { AttachmentMeta } from "@/lib/applications";
import { deleteAttachments } from "@/lib/application-attachments";

async function requireUser() {
  const u = await getCurrentUser();
  if (!u) throw new Error("Unauthorized");
  return u;
}

const VALID: ApplicationStatus[] = ["SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED"];

export async function setApplicationStatusAction(formData: FormData) {
  const me = await requireUser();
  const id = String(formData.get("id"));
  const statusRaw = String(formData.get("status"));
  if (!VALID.includes(statusRaw as ApplicationStatus)) throw new Error("Invalid status");
  const status = statusRaw as ApplicationStatus;

  // Only set reviewedBy/At if the new status is a "decision" — Submitted is the
  // initial state and shouldn't claim a reviewer.
  const auditFields = status === "SUBMITTED"
    ? { reviewedAt: null, reviewedById: null }
    : { reviewedAt: new Date(), reviewedById: await safeReviewerId(me.userId) };

  const before = await prisma.causeApplication.findUnique({ where: { id }, select: { status: true } });
  await prisma.causeApplication.update({
    where: { id },
    data: { status, ...auditFields },
  });
  await audit({
    action: "application.status.change",
    userId: me.userId,
    entityType: "CauseApplication",
    entityId: id,
    payload: { from: before?.status ?? null, to: status },
  });
  revalidatePath("/admin/forms");
  revalidatePath(`/admin/forms/${id}`);
}

export async function saveApplicationNotesAction(formData: FormData) {
  const me = await requireUser();
  const id = String(formData.get("id"));
  const adminNotes = String(formData.get("adminNotes") ?? "").trim() || null;
  await prisma.causeApplication.update({ where: { id }, data: { adminNotes } });
  await audit({
    action: "application.notes.save",
    userId: me.userId,
    entityType: "CauseApplication",
    entityId: id,
    // Don't include the notes body in the audit payload — it can be sensitive and
    // governance only needs the fact-of-change.
    payload: { changed: true },
  });
  revalidatePath(`/admin/forms/${id}`);
}

/** Permanently delete an application and its uploaded files. ADMIN role only. */
export async function deleteApplicationAction(formData: FormData) {
  const me = await requireUser();
  if (me.role !== "ADMIN") throw new Error("Only admins can delete applications.");
  const id = String(formData.get("id"));
  const app = await prisma.causeApplication.findUnique({
    where: { id },
    select: { applicationNo: true, fullName: true, formType: true, status: true, attachmentMeta: true },
  });
  if (!app) redirect("/admin/forms");

  await prisma.causeApplication.delete({ where: { id } });
  await deleteAttachments((app.attachmentMeta as AttachmentMeta[] | null) ?? []);
  await audit({
    action: "application.delete",
    userId: me.userId,
    entityType: "CauseApplication",
    entityId: id,
    payload: { applicationNo: app.applicationNo, fullName: app.fullName, formType: app.formType, status: app.status },
  });
  revalidatePath("/admin/forms");
  redirect(`/admin/forms?deleted=${encodeURIComponent(app.applicationNo)}`);
}

// Same safety pattern used in app/admin/causes/actions.ts: avoid FK violations from
// stale session userIds (e.g. after a prod reseed).
async function safeReviewerId(userId: string): Promise<string | null> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  return u?.id ?? null;
}
