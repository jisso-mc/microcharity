"use server";

import { revalidatePath } from "next/cache";
import type { ApplicationStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

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
  const audit = status === "SUBMITTED"
    ? { reviewedAt: null, reviewedById: null }
    : { reviewedAt: new Date(), reviewedById: await safeReviewerId(me.userId) };

  await prisma.causeApplication.update({
    where: { id },
    data: { status, ...audit },
  });
  revalidatePath("/admin/forms");
  revalidatePath(`/admin/forms/${id}`);
}

export async function saveApplicationNotesAction(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id"));
  const adminNotes = String(formData.get("adminNotes") ?? "").trim() || null;
  await prisma.causeApplication.update({ where: { id }, data: { adminNotes } });
  revalidatePath(`/admin/forms/${id}`);
}

// Same safety pattern used in app/admin/causes/actions.ts: avoid FK violations from
// stale session userIds (e.g. after a prod reseed).
async function safeReviewerId(userId: string): Promise<string | null> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  return u?.id ?? null;
}
