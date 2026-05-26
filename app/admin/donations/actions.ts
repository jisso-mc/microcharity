"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { DonationType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { createManualDonation, approveDonation, rejectDonation, issueReceiptForDonation, resendReceiptForDonation } from "@/lib/donations";
import { audit } from "@/lib/audit";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  return user;
}

export type FormState = { error?: string; ok?: true };

const TYPES: DonationType[] = ["ONLINE", "OFFLINE", "MANUAL"];

export async function createManualDonationAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const me = await requireAdmin();

  const causeId    = String(formData.get("causeId") ?? "").trim();
  const donorName  = String(formData.get("donorName") ?? "").trim();
  const donorEmail = String(formData.get("donorEmail") ?? "").trim();
  const amountRaw  = String(formData.get("amount") ?? "").trim();
  const typeRaw    = String(formData.get("type") ?? "MANUAL").trim();
  const dateRaw    = String(formData.get("date") ?? "").trim();

  if (!causeId)    return { error: "Pick a cause." };
  if (!donorName)  return { error: "Donor name is required." };
  if (!donorEmail) return { error: "Donor email is required." };
  const amount = Number(amountRaw);
  if (!Number.isFinite(amount) || amount < 1) return { error: "Amount must be at least ₹1." };
  if (!TYPES.includes(typeRaw as DonationType)) return { error: "Invalid donation type." };

  const date = dateRaw ? new Date(dateRaw) : undefined;
  if (date && Number.isNaN(date.getTime())) return { error: "Invalid date." };

  const d = await createManualDonation({
    causeId,
    donorName,
    donorEmail,
    donorPhone:       toStr(formData.get("donorPhone")),
    donorAddress:     toStr(formData.get("donorAddress")),
    amount,
    type:             typeRaw as DonationType,
    paymentReference: toStr(formData.get("paymentReference")),
    pan:              toStr(formData.get("pan")),
    adminNotes:       toStr(formData.get("adminNotes")),
    date,
  });
  await audit({
    action: "donation.create.manual",
    userId: me.userId,
    entityType: "Donation",
    entityId: d.id,
    payload: { causeId, donorEmail, amount, type: typeRaw },
  });

  revalidatePath("/admin/donations");
  redirect(`/admin/donations?created=${d.id}`);
}

// Sanity ceiling for editedAmount on approval. Anything above this is presumed a typo
// or an attempt to corrupt cause.raisedAmount; we reject early before touching the DB.
const APPROVE_MAX_AMOUNT = 1_00_00_00_000; // ₹100 crore — well above any real donation
const APPROVE_MAX_MULTIPLIER = 10;          // also bounded to 10× the originally-submitted amount

export async function approveDonationAction(formData: FormData) {
  const user = await requireAdmin();
  const id = String(formData.get("id"));
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const editedAmount = amountRaw ? Number(amountRaw) : undefined;

  if (editedAmount !== undefined) {
    if (!Number.isFinite(editedAmount) || editedAmount < 1) {
      throw new Error("Edited amount must be a positive integer.");
    }
    if (editedAmount > APPROVE_MAX_AMOUNT) {
      throw new Error(`Edited amount exceeds the ₹${APPROVE_MAX_AMOUNT.toLocaleString("en-IN")} cap.`);
    }
    // Cross-check against the donation's original amount.
    const original = await prisma.donation.findUnique({ where: { id }, select: { amount: true } });
    if (original && editedAmount > original.amount * APPROVE_MAX_MULTIPLIER) {
      throw new Error(
        `Edited amount is more than ${APPROVE_MAX_MULTIPLIER}× the submitted amount (₹${original.amount.toLocaleString("en-IN")}). Reject this donation and re-create it manually if the figure is correct.`
      );
    }
  }

  // Grab the cause slug along with the donation amount up-front so we can revalidate
  // the public cause page after approval. Without this, the page kept showing the
  // pre-approval `raisedAmount` until the 60s ISR window expired — even though the
  // DB already had the incremented total.
  const before = await prisma.donation.findUnique({
    where: { id },
    select: { amount: true, cause: { select: { slug: true } } },
  });
  await approveDonation(id, user.userId, { editedAmount });
  await audit({
    action: "donation.approve",
    userId: user.userId,
    entityType: "Donation",
    entityId: id,
    payload: {
      originalAmount: before?.amount ?? null,
      editedAmount: editedAmount ?? null,
    },
  });
  revalidatePath("/admin/donations");
  // Bust the ISR cache on every public surface that shows this cause's raised total.
  revalidatePath("/");
  revalidatePath("/current-causes");
  if (before?.cause.slug) revalidatePath(`/donations/${before.cause.slug}`);

  // Receipt issuance (PDF generation 1-2s + two Gmail SMTP sends 2-5s each)
  // was the entire wait the admin felt after clicking Approve — 5-12s on top
  // of the actually-relevant work. The donation is already APPROVED, the
  // cause total is already bumped, and the donor list will refresh on the
  // next request. The receipt only needs to exist eventually, not before
  // the admin sees the row update.
  //
  // Defer via after() — Vercel keeps the function alive past the response,
  // PDF + emails finish in the background. issueReceiptForDonation is
  // idempotent (early-returns if sentAt is set), so a manual Resend Receipt
  // click later is safe. Failures are logged for monitoring.
  after(async () => {
    try {
      await issueReceiptForDonation(id);
    } catch (e) {
      console.error("[approveDonationAction] background receipt issuance failed", { donationId: id, error: e });
    }
  });
}

export async function resendReceiptAction(formData: FormData) {
  const user = await requireAdmin();
  const id = String(formData.get("id"));
  const d = await prisma.donation.findUnique({ where: { id }, select: { status: true, cause: { select: { slug: true } } } });
  if (!d) throw new Error("Donation not found.");
  if (d.status !== "APPROVED") throw new Error("Receipt can only be resent for APPROVED donations.");
  await audit({
    action: "donation.approve", // closest existing — represents the "receipt issued" follow-up
    userId: user.userId,
    entityType: "Donation",
    entityId: id,
    payload: { resend: true },
  });
  revalidatePath("/admin/donations");
  // Resend is the slowest action in the donations admin (Gmail SMTP +
  // potential PDF regeneration). Defer so the button's spinner goes away
  // immediately while the email actually sends in the background.
  after(async () => {
    try {
      await resendReceiptForDonation(id);
    } catch (e) {
      console.error("[resendReceiptAction] background resend failed", { donationId: id, error: e });
    }
  });
}

export async function rejectDonationAction(formData: FormData) {
  const user = await requireAdmin();
  const id = String(formData.get("id"));
  const reason = toStr(formData.get("reason"));
  await rejectDonation(id, user.userId, reason);
  await audit({
    action: "donation.reject",
    userId: user.userId,
    entityType: "Donation",
    entityId: id,
    payload: { reason: reason ?? null },
  });
  revalidatePath("/admin/donations");
}

function toStr(v: FormDataEntryValue | null): string | undefined {
  const s = (v == null ? "" : String(v)).trim();
  return s.length ? s : undefined;
}
