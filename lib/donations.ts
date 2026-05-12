// Donation lifecycle helpers — used by manual entry, offline approval, and (later) Razorpay webhook.
//
// All mutations run inside a transaction so cause / donor / donation rows stay consistent.
// Approval is the only step that increments cause.raisedAmount and donor.totalDonated.

import { prisma } from "./prisma";
import type { DonationType } from "@prisma/client";
import { buildReceiptPdf, nextReceiptNumber } from "./receipt";
import { sendDonationReceipt80G } from "./email";
import { encryptPii, decryptPiiSafe } from "./crypto";
import { retryOnUniqueViolation } from "./retry";

export type CreateManualInput = {
  causeId: string;
  donorName: string;
  donorEmail: string;
  donorPhone?: string;
  donorAddress?: string;
  amount: number;          // INR, integer rupees
  type: DonationType;      // ONLINE | OFFLINE | MANUAL
  paymentReference?: string;
  pan?: string;
  adminNotes?: string;
  date?: Date;
};

export async function createManualDonation(input: CreateManualInput) {
  const email = input.donorEmail.trim().toLowerCase();

  return prisma.$transaction(async (tx) => {
    const donor = await tx.donor.upsert({
      where: { email },
      update: {
        // Refresh contact details with whatever the admin entered.
        name: input.donorName,
        phone: input.donorPhone ?? undefined,
        address: input.donorAddress ?? undefined,
      },
      create: {
        email,
        name: input.donorName,
        phone: input.donorPhone,
        address: input.donorAddress,
      },
    });

    const donation = await tx.donation.create({
      data: {
        causeId: input.causeId,
        donorId: donor.id,
        donorNameSnapshot: input.donorName,
        donorEmailSnapshot: email,
        amount: input.amount,
        type: input.type,
        status: "PENDING",
        paymentReference: input.paymentReference,
        // PAN is PII — store ciphertext only (lib/crypto.ts AES-256-GCM, key in PII_ENC_KEY env).
        panEncrypted: encryptPii(input.pan),
        addressSnapshot: input.donorAddress,
        adminNotes: input.adminNotes,
        ...(input.date ? { createdAt: input.date } : {}),
      },
    });

    return donation;
  });
}

/**
 * Create a PENDING donation submitted by the donor themselves (Offline / QR flows).
 * Mirrors createOnlineDonationOrder but covers the non-Razorpay paths.
 *
 * The cause amount is NOT incremented here — that happens in approveDonation when
 * an admin verifies the bank transfer / UTR.
 */
export async function createUnverifiedDonation(input: {
  causeId: string;
  donorName: string;
  donorEmail: string;
  donorPhone?: string;
  donorAddress?: string;
  amount: number;
  type: "OFFLINE" | "QR";
  paymentReference?: string;
  utr?: string;
  paymentDate?: Date;
}) {
  const email = input.donorEmail.trim().toLowerCase();
  return prisma.$transaction(async (tx) => {
    const donor = await tx.donor.upsert({
      where: { email },
      update: {
        name: input.donorName,
        phone: input.donorPhone ?? undefined,
        address: input.donorAddress ?? undefined,
      },
      create: {
        email,
        name: input.donorName,
        phone: input.donorPhone,
        address: input.donorAddress,
      },
    });
    return tx.donation.create({
      data: {
        causeId: input.causeId,
        donorId: donor.id,
        donorNameSnapshot: input.donorName,
        donorEmailSnapshot: email,
        addressSnapshot: input.donorAddress,
        amount: input.amount,
        type: input.type,
        status: "PENDING",
        paymentReference: input.paymentReference,
        utr: input.utr,
        paymentDate: input.paymentDate,
      },
    });
  });
}

/**
 * Create a PENDING online donation tied to a freshly-created Razorpay order.
 * Called from /api/donate/online before opening Checkout on the client.
 */
export async function createOnlineDonationOrder(input: {
  causeId: string;
  donorName: string;
  donorEmail: string;
  donorPhone?: string;
  amount: number;            // INR rupees (integer)
  razorpayOrderId: string;
}) {
  const email = input.donorEmail.trim().toLowerCase();
  return prisma.$transaction(async (tx) => {
    const donor = await tx.donor.upsert({
      where: { email },
      update: {
        name: input.donorName,
        phone: input.donorPhone ?? undefined,
      },
      create: {
        email,
        name: input.donorName,
        phone: input.donorPhone,
      },
    });
    const donation = await tx.donation.create({
      data: {
        causeId: input.causeId,
        donorId: donor.id,
        donorNameSnapshot: input.donorName,
        donorEmailSnapshot: email,
        amount: input.amount,
        type: "ONLINE",
        status: "PENDING",
        razorpayOrderId: input.razorpayOrderId,
      },
    });
    return donation;
  });
}

/**
 * Approve a donation. Called from:
 *   - admin "Approve" button (offline / manual)        → approverId = admin user
 *   - Razorpay webhook (online payment.captured)        → approverId = null (system)
 *   - Razorpay client return verification (best effort) → approverId = null (system)
 */
export async function approveDonation(donationId: string, approverId: string | null, opts?: { editedAmount?: number; razorpayPaymentId?: string; razorpaySignature?: string }) {
  return prisma.$transaction(async (tx) => {
    const d = await tx.donation.findUnique({ where: { id: donationId } });
    if (!d) throw new Error("Donation not found");
    if (d.status === "APPROVED") return d; // idempotent — useful when called from a webhook
    if (d.status !== "PENDING") throw new Error(`Cannot approve from ${d.status}`);

    const finalAmount = Number.isFinite(opts?.editedAmount) && (opts!.editedAmount as number) > 0
      ? (opts!.editedAmount as number)
      : d.amount;

    // Increment cause.donorCount only the first time this donor contributes to this cause.
    let isNewDonorForCause = true;
    if (d.donorId) {
      const previousApproved = await tx.donation.count({
        where: {
          donorId: d.donorId,
          causeId: d.causeId,
          status: "APPROVED",
          id: { not: d.id },
        },
      });
      isNewDonorForCause = previousApproved === 0;
    }

    const updated = await tx.donation.update({
      where: { id: donationId },
      data: {
        status: "APPROVED",
        amount: finalAmount,
        approvedAt: new Date(),
        approvedById: approverId ?? null,
        ...(opts?.razorpayPaymentId ? { razorpayPaymentId: opts.razorpayPaymentId } : {}),
        ...(opts?.razorpaySignature ? { razorpaySignature: opts.razorpaySignature } : {}),
      },
    });

    await tx.cause.update({
      where: { id: d.causeId },
      data: {
        raisedAmount: { increment: finalAmount },
        ...(isNewDonorForCause ? { donorCount: { increment: 1 } } : {}),
      },
    });

    if (d.donorId) {
      const donor = await tx.donor.findUnique({ where: { id: d.donorId } });
      await tx.donor.update({
        where: { id: d.donorId },
        data: {
          totalDonated: { increment: finalAmount },
          donationCount: { increment: 1 },
          firstDonationAt: donor?.firstDonationAt ?? new Date(),
          lastDonationAt: new Date(),
        },
      });
    }

    return updated;
  });
}

/** Mark a PENDING online donation as FAILED (no totals adjusted). */
export async function failDonationByOrderId(orderId: string, reason?: string) {
  const d = await prisma.donation.findUnique({ where: { razorpayOrderId: orderId } });
  if (!d || d.status !== "PENDING") return null;
  return prisma.donation.update({
    where: { id: d.id },
    data: {
      status: "FAILED",
      ...(reason ? { adminNotes: reason } : {}),
    },
  });
}

/**
 * Generate (if needed) and email the 80G receipt for an APPROVED donation.
 *
 * Idempotent — if a Receipt row already exists with sentAt, this is a no-op. Safe to call
 * from Razorpay verify, the Razorpay webhook (separate hop), and the admin approve action.
 *
 * Errors here are logged but never thrown to callers, since failing to send a receipt
 * should not roll back the approval (the cause total is already updated; we'll let an
 * admin trigger a resend).
 */
export async function issueReceiptForDonation(donationId: string): Promise<void> {
  try {
    const d = await prisma.donation.findUnique({
      where: { id: donationId },
      include: {
        cause: { select: { title: true, mcId: true } },
        // Pull the donor row alongside so we can fall back to Donor.panEncrypted
        // if this particular donation didn't capture a PAN.
        donor: { select: { panEncrypted: true } },
      },
    });
    if (!d) return;
    if (d.status !== "APPROVED") return;

    const existing = await prisma.receipt.findUnique({ where: { donationId } });
    if (existing?.sentAt) return; // already sent

    let receiptRow = existing;
    if (!receiptRow) {
      // Allocate number and create row inside a transaction; the @@unique on receiptNumber
      // catches any concurrent collision and the retry wrapper picks up the new max.
      receiptRow = await retryOnUniqueViolation(() => prisma.$transaction(async (tx) => {
        const num = await nextReceiptNumber(tx, d.approvedAt ?? d.createdAt);
        return tx.receipt.create({
          data: {
            receiptNumber: num,
            donationId: d.id,
          },
        });
      }));
    }

    // Payment-mode labels matched to the new Finance template.
    const paymentMode =
      d.type === "ONLINE"  ? "Online - Razorpay" :
      d.type === "QR"      ? "UPI" :
      d.type === "OFFLINE" ? "Bank Transfer - NEFT / IMPS / RTGS" :
      "Manual entry";

    const paymentDate = d.paymentDate ?? d.approvedAt ?? d.createdAt;

    // PAN — decrypt either the per-donation field or the donor profile, whichever
    // is set. Stored ciphertext is "v1:..." (AES-256-GCM via lib/crypto.ts).
    const panCiphertext = d.panEncrypted ?? d.donor?.panEncrypted ?? null;
    const donorPan = decryptPiiSafe(panCiphertext) || null;

    const pdf = await buildReceiptPdf({
      receiptNumber: receiptRow.receiptNumber,
      receiptDate: new Date(),
      donorName: d.donorNameSnapshot,
      donorPan,
      causeTitle: d.cause.title,
      causeMcId: d.cause.mcId ?? null,
      amount: d.amount,
      paymentMode,
      paymentDate,
    });

    await sendDonationReceipt80G({
      donorName: d.donorNameSnapshot,
      donorEmail: d.donorEmailSnapshot,
      causeTitle: d.cause.title,
      receiptNumber: receiptRow.receiptNumber,
      amount: d.amount,
      paymentMethod: paymentMode,
      pdf: Buffer.from(pdf),
    });

    await prisma.receipt.update({
      where: { id: receiptRow.id },
      data: { sentAt: new Date(), sentToEmail: d.donorEmailSnapshot },
    });
  } catch (err) {
    console.error("[issueReceiptForDonation] failed for", donationId, err);
  }
}

export async function rejectDonation(donationId: string, approverId: string, reason?: string) {
  return prisma.donation.update({
    where: { id: donationId },
    data: {
      status: "REJECTED",
      approvedAt: new Date(),
      approvedById: approverId,
      ...(reason ? { adminNotes: reason } : {}),
    },
  });
}
