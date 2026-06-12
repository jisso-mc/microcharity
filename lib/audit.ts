// Audit log writes — central helper so every callsite has the same shape and we don't
// pepper try/catch around every `prisma.auditLog.create` call.
//
// Audit failures must NEVER fail the underlying action — a missed log line is a
// governance issue, not a user-facing one. We swallow + console.error so the action
// completes regardless.

import { headers } from "next/headers";
import { prisma } from "./prisma";

export type AuditAction =
  // Donations
  | "donation.approve"
  | "donation.reject"
  | "donation.create.manual"
  | "donation.export"
  // Causes
  | "cause.create"
  | "cause.publish"
  | "cause.close"
  | "cause.delete"
  | "cause.update.delete"
  // Users
  | "user.invite"
  | "user.invite.resend"
  | "user.activate"
  | "user.deactivate"
  | "user.role.change"
  | "user.password.reset"          // self-service via /admin/profile
  // Cause applications
  | "application.status.change"
  | "application.notes.save"
  // Launch announcements (bulk mailer)
  | "announcement.send.start"
  | "announcement.send.cancel"
  // Site-wide settings
  | "sitestat.update"
  // Donors
  | "donor.activate"
  | "donor.deactivate"
  | "donor.subscribe"
  | "donor.unsubscribe"
  | "donor.softDelete";

export type AuditInput = {
  action: AuditAction;
  userId?: string | null;          // who performed the action; null for system / Razorpay webhook
  entityType: string;              // e.g. "Donation", "Cause", "User", "CauseApplication"
  entityId?: string | null;
  payload?: Record<string, unknown>;
};

async function originIp(): Promise<string | null> {
  try {
    const h = await headers();
    const fwd = h.get("x-forwarded-for");
    if (fwd) return fwd.split(",")[0]?.trim() ?? null;
    return h.get("x-real-ip") ?? null;
  } catch {
    return null;
  }
}

export async function audit(input: AuditInput): Promise<void> {
  try {
    const ip = await originIp();
    await prisma.auditLog.create({
      data: {
        action: input.action,
        userId: input.userId ?? null,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        payload: input.payload ? (input.payload as never) : undefined,
        ipAddress: ip,
      },
    });
  } catch (e) {
    console.error("[audit] failed to write", input.action, e);
  }
}
