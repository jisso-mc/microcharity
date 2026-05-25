// Donation lifecycle helpers — used by manual entry, offline approval, and (later) Razorpay webhook.
//
// All mutations run inside a transaction so cause / donor / donation rows stay consistent.
// Approval is the only step that increments cause.raisedAmount and donor.totalDonated.

import { prisma } from "./prisma";
import type { DonationType } from "@prisma/client";
import { buildReceiptPdf, nextReceiptNumber } from "./receipt";
import { sendDonationReceipt80G, sendDonationAck } from "./email";
import { encryptPii, decryptPiiSafe } from "./crypto";
import { retryOnUniqueViolation } from "./retry";
import { formatPostedDate } from "./mcid";

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
  donorPan?: string;
  donorAddress?: string;
  amount: number;
  type: "OFFLINE" | "QR";
  paymentReference?: string;
  utr?: string;
  paymentDate?: Date;
}) {
  const email = input.donorEmail.trim().toLowerCase();
  // PAN is PII — encrypt before any DB write. Re-encrypting on each donation is
  // intentional: same plaintext → different ciphertext (random IV) so a DB leak
  // can't be used to correlate "same PAN" across rows.
  const panCipher = encryptPii(input.donorPan);
  return prisma.$transaction(async (tx) => {
    const donor = await tx.donor.upsert({
      where: { email },
      update: {
        name: input.donorName,
        phone: input.donorPhone ?? undefined,
        address: input.donorAddress ?? undefined,
        ...(panCipher ? { panEncrypted: panCipher } : {}),
      },
      create: {
        email,
        name: input.donorName,
        phone: input.donorPhone,
        address: input.donorAddress,
        panEncrypted: panCipher,
      },
    });
    return tx.donation.create({
      data: {
        causeId: input.causeId,
        donorId: donor.id,
        donorNameSnapshot: input.donorName,
        donorEmailSnapshot: email,
        addressSnapshot: input.donorAddress,
        panEncrypted: panCipher,
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
  donorPan?: string;
  amount: number;            // INR rupees (integer)
  razorpayOrderId: string;
}) {
  const email = input.donorEmail.trim().toLowerCase();
  const panCipher = encryptPii(input.donorPan);
  return prisma.$transaction(async (tx) => {
    const donor = await tx.donor.upsert({
      where: { email },
      update: {
        name: input.donorName,
        phone: input.donorPhone ?? undefined,
        ...(panCipher ? { panEncrypted: panCipher } : {}),
      },
      create: {
        email,
        name: input.donorName,
        phone: input.donorPhone,
        panEncrypted: panCipher,
      },
    });
    const donation = await tx.donation.create({
      data: {
        causeId: input.causeId,
        donorId: donor.id,
        donorNameSnapshot: input.donorName,
        donorEmailSnapshot: email,
        panEncrypted: panCipher,
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

    // Auto-close the cause when this donation pushes it to / past its goal.
    // Behaviour (per Jisso):
    //   * Skips if cause is already CLOSED — admin cancellation wins over
    //     a late-arriving donation that nudges over the line.
    //   * Skips if any existing timeline entry already says "fund raising
    //     closed" (case/whitespace-insensitive) — avoids duplicating an
    //     entry an admin added manually.
    //   * Skips if goalAmount === 0 — informational causes (e.g. JCI
    //     Nalukody) have no fund-raising target.
    //
    // When all guards pass we append a "Mon D, YYYY - Fund Raising Closed"
    // timeline entry AND flip status to CLOSED in the same transaction, so
    // the public cause page (revalidated by the caller) reflects both
    // changes together.
    const causeNow = await tx.cause.findUniqueOrThrow({
      where: { id: d.causeId },
      select: {
        slug: true,
        raisedAmount: true,
        goalAmount: true,
        status: true,
        updates: { select: { caption: true } },
      },
    });
    const goalReached =
      causeNow.goalAmount > 0
      && causeNow.raisedAmount >= causeNow.goalAmount
      && causeNow.status !== "CLOSED"
      && !causeNow.updates.some((u) => /fund\s+raising\s+closed/i.test(u.caption ?? ""));
    if (goalReached) {
      const last = await tx.causeUpdate.findFirst({
        where: { causeId: d.causeId },
        orderBy: { sortOrder: "desc" },
        select: { sortOrder: true },
      });
      const today = new Date();
      await tx.causeUpdate.create({
        data: {
          causeId: d.causeId,
          caption: `${formatPostedDate(today)} - Fund Raising Closed`,
          body: "Fund raising closed for this cause.",
          sortOrder: (last?.sortOrder ?? -1) + 1,
          postedAt: today,
        },
      });
      await tx.cause.update({
        where: { id: d.causeId },
        data: { status: "CLOSED" },
      });
    }

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
 * Force a re-send of the 80G receipt for an APPROVED donation. Clears Receipt.sentAt
 * first so issueReceiptForDonation will go through the build+email path even if the
 * row already exists. Used by the admin "Resend receipt" action.
 *
 * Throws if the receipt was already (re-)sent within RESEND_COOLDOWN_MS — defense
 * against double-clicks / accidental form re-submits leading to duplicate emails.
 */
const RESEND_COOLDOWN_MS = 30_000; // 30 seconds
export async function resendReceiptForDonation(donationId: string): Promise<void> {
  const r = await prisma.receipt.findUnique({ where: { donationId } });
  if (r?.sentAt && Date.now() - r.sentAt.getTime() < RESEND_COOLDOWN_MS) {
    throw new Error("Receipt was sent in the last 30 seconds — please wait before resending again.");
  }
  if (r) {
    await prisma.receipt.update({ where: { id: r.id }, data: { sentAt: null, sentToEmail: null } });
  }
  await issueReceiptForDonation(donationId);
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
      donorAddress: d.addressSnapshot,
      causeTitle: d.cause.title,
      causeMcId: d.cause.mcId ?? null,
      amount: d.amount,
      paymentMode,
      paymentDate,
    });

    // For Razorpay donations the donor never got an ack at submission time (unlike
    // UPI / Offline where it goes out from the API route). Send it here, just
    // before the 80G — both arrive together for the donor. Idempotent because the
    // outer Receipt.sentAt guard at the top of this function blocks re-runs.
    if (d.type === "ONLINE") {
      try {
        await sendDonationAck({
          donorName: d.donorNameSnapshot,
          donorEmail: d.donorEmailSnapshot,
          causeTitle: d.cause.title,
          donationDate: d.approvedAt ?? d.createdAt,
          amount: d.amount,
          paymentMethod: paymentMode,
          paymentId: d.razorpayPaymentId ?? d.id.slice(-8).toUpperCase(),
        });
      } catch (e) {
        // Don't fail the 80G send because the ack hiccupped — 80G is the priority.
        console.error("[issueReceiptForDonation] ack email failed (continuing to 80G)", e);
      }
    }

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
    // Print the error chain in full so Vercel function logs include the
    // pdf-lib / nodemailer message (the previous one-line log gave us only
    // "[issueReceiptForDonation] failed for <id>" which wasn't actionable).
    console.error("[issueReceiptForDonation] failed for", donationId);
    console.error(err instanceof Error ? err.stack ?? err.message : err);
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
