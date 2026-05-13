// Cause launch announcement emails — bulk mailer to all opted-in donors.
//
// Flow:
//   1. Admin clicks "Send launch announcement" on /admin/causes/[slug].
//      → createCauseAnnouncement() snapshots every opted-in donor into
//        AnnouncementRecipient rows and creates the parent CauseAnnouncement row.
//   2. The admin UI polls /api/cause-announcements/[id]/process every 60 seconds.
//      → processNextBatch() picks up to BATCH_SIZE PENDING recipients, sends the
//        email, marks them SENT or FAILED. Returns progress.
//   3. When 0 PENDING remain, status flips to COMPLETED.
//
// Per-recipient HMAC tokens mean an unsubscribe link from donor A's email can't
// be used to unsubscribe donor B. Tokens are stable across announcements per
// donor — we derive them deterministically from email + a project secret.

import crypto from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { sendEmail, safeHeader } from "./email";

export const BATCH_SIZE = 50;            // per-poll send count (per the user's 50/min throttle)

// HMAC secret reused from ADMIN_SESSION_SECRET (already enforced ≥32 chars). Same
// key for every recipient; the donorEmail is the distinguishing input.
function unsubSecret(): Buffer {
  const s = process.env.ADMIN_SESSION_SECRET;
  if (!s || s.length < 32) {
    throw new Error("ADMIN_SESSION_SECRET must be set to a string of 32+ characters.");
  }
  return Buffer.from(s, "utf8");
}

export function makeUnsubscribeToken(donorEmail: string): string {
  return crypto.createHmac("sha256", unsubSecret()).update(donorEmail.toLowerCase()).digest("hex");
}

export function verifyUnsubscribeToken(donorEmail: string, token: string): boolean {
  if (!token || !donorEmail) return false;
  const expected = makeUnsubscribeToken(donorEmail);
  if (expected.length !== token.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(token, "hex"));
}

// ---------- Email body rendering ----------

const ESCAPE: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ESCAPE[c]);

export type AnnouncementCauseInput = {
  slug: string;
  title: string;
  summary: string;          // already chosen by caller (summary or contentHtml fallback)
  featuredImage: string | null;
};

/**
 * Renders the announcement HTML for one recipient. We re-render per recipient
 * because the unsubscribe link is per-recipient — splicing it into a pre-rendered
 * template would mean parsing HTML, which is fragile.
 */
export function renderAnnouncementHtml(opts: {
  cause: AnnouncementCauseInput;
  origin: string;
  recipientEmail: string;
  unsubscribeToken: string;
}): string {
  const causeUrl = `${opts.origin}/donations/${opts.cause.slug}`;
  const supportUrl = `${opts.origin}/donations/support-microcharity`;
  const unsubUrl = `${opts.origin}/unsubscribe?email=${encodeURIComponent(opts.recipientEmail)}&token=${opts.unsubscribeToken}`;
  const logoUrl = `${opts.origin}/logo.jpg`;
  const mailerImageUrl = `${opts.origin}/mailer-image.jpg`;

  // Body of the cause section: the new timeline entry text followed by a small
  // pointer back to the full cause page. Paragraphs in the entry body are
  // separated by blank lines; we preserve them as <br/><br/>.
  const summaryBody = esc(opts.cause.summary).replace(/\r?\n\r?\n/g, "<br/><br/>").replace(/\n/g, "<br/>");
  const summaryHtml = `${summaryBody}<br/><br/><em style="color:#6b6363;">(see the cause page for full details)</em>`;

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f7f6f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#3b3838;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f6f4;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #e7e3df;border-radius:12px;overflow:hidden;">

        <!-- Logo -->
        <tr><td align="center" style="padding:24px 24px 0;">
          <img src="${logoUrl}" alt="MicroCharity" style="height:60px;display:block;border:0;" />
        </td></tr>

        <!-- Headline -->
        <tr><td align="center" style="padding:8px 24px 0;">
          <h1 style="margin:0;font-size:18px;color:#1d1a1a;font-weight:600;line-height:1.4;">
            MicroCharity Announces Support for a new cause
          </h1>
        </td></tr>

        <!-- Cause: image → title → description → CTA, in that order. -->
        <tr><td style="padding:20px 24px 0;">
          ${opts.cause.featuredImage
            ? `<p style="margin:0 0 16px;"><a href="${causeUrl}" style="display:block;"><img src="${opts.cause.featuredImage}" alt="${esc(opts.cause.title)}" style="max-width:100%;height:auto;display:block;border:0;border-radius:8px;" /></a></p>`
            : ""
          }
          <h2 style="margin:0 0 12px;font-size:22px;font-weight:600;line-height:1.3;">
            <a href="${causeUrl}" style="color:#2a7fb8;text-decoration:underline;">${esc(opts.cause.title)}</a>
          </h2>
          <p style="margin:0 0 16px;font-size:14px;color:#3b3838;line-height:1.6;">
            ${summaryHtml}
          </p>
          <p style="margin:0 0 24px;">
            <a href="${causeUrl}" style="display:inline-block;background:#cc2222;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 28px;border-radius:6px;font-size:15px;">Donate Now</a>
          </p>
        </td></tr>

        <!-- Support MicroCharity boilerplate -->
        <tr><td style="padding:8px 24px 0;border-top:1px solid #e7e3df;">
          <h2 style="margin:18px 0 12px;font-size:20px;font-weight:600;color:#2a7fb8;">
            <a href="${supportUrl}" style="color:#2a7fb8;text-decoration:underline;">Support MicroCharity</a>
          </h2>
          <p style="margin:0 0 16px;font-size:14px;color:#3b3838;line-height:1.6;">
            All our administrative expenses are absorbed by MicroCharity volunteers. That gives us
            the unique tag of <em>'zero-expense charity'</em> where every penny of the donor reaches
            the needy. Would you like to donate towards our running expenses? Please do!
          </p>
          <p style="margin:0 0 24px;">
            <a href="${supportUrl}" style="display:inline-block;background:#cc2222;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 28px;border-radius:6px;font-size:15px;">Donate Now</a>
          </p>
        </td></tr>

        <!-- Online payment options banner -->
        <tr><td style="padding:0 24px 8px;border-top:1px solid #e7e3df;">
          <p style="margin:18px 0 12px;font-size:14px;color:#3b3838;line-height:1.6;">
            Donating to MicroCharity is easier. We now accept Online Payments!
          </p>
          <p style="margin:0 0 24px;">
            <img src="${mailerImageUrl}" alt="Online payment options" style="max-width:100%;height:auto;display:block;border:0;" />
          </p>
        </td></tr>

        <!-- Footer: address + unsubscribe -->
        <tr><td style="padding:16px 24px 24px;background:#f7f6f4;border-top:1px solid #e7e3df;text-align:center;">
          <p style="margin:0 0 6px;font-size:12px;color:#6b6363;">
            <a href="${unsubUrl}" style="color:#6b6363;text-decoration:underline;">Unsubscribe</a>
          </p>
          <p style="margin:0;font-size:12px;color:#6b6363;line-height:1.5;">
            MicroCharity Trust, 112 West Village, Kengeri, Bangalore - 560060
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>`;
}

export function renderAnnouncementText(opts: {
  cause: AnnouncementCauseInput;
  origin: string;
  recipientEmail: string;
  unsubscribeToken: string;
}): string {
  const causeUrl = `${opts.origin}/donations/${opts.cause.slug}`;
  const supportUrl = `${opts.origin}/donations/support-microcharity`;
  const unsubUrl = `${opts.origin}/unsubscribe?email=${encodeURIComponent(opts.recipientEmail)}&token=${opts.unsubscribeToken}`;
  return (
    `MicroCharity Announces Support for a new cause\n\n` +
    `${opts.cause.title}\n${causeUrl}\n\n` +
    `${opts.cause.summary}\n\n` +
    `Donate now: ${causeUrl}\n\n` +
    `---\n\n` +
    `Support MicroCharity (${supportUrl})\n\n` +
    `All our administrative expenses are absorbed by MicroCharity volunteers. ` +
    `Every penny of donor funds reaches the needy. Support our running expenses: ${supportUrl}\n\n` +
    `---\n\n` +
    `MicroCharity Trust, 112 West Village, Kengeri, Bangalore - 560060\n` +
    `Unsubscribe: ${unsubUrl}`
  );
}

// ---------- Recipient snapshot ----------

/**
 * Create a CauseAnnouncement plus one AnnouncementRecipient per opted-in donor.
 * Returns the announcement id and the recipient count. Idempotency note: this is
 * intentionally NOT idempotent — clicking "Send" twice creates two announcements.
 * The UI prevents that by showing a single in-flight row.
 *
 * When `testRecipients` is provided, the recipient list is overridden to that
 * fixed set. Used by the "Send test" toggle so admins can preview the email in
 * their own inboxes before fanning out to 300+ donors.
 */
export async function createAnnouncement(input: {
  causeId: string;
  subject: string;
  sentByUserId: string | null;
  testRecipients?: Array<{ name: string; email: string }>;
}): Promise<{ id: string; totalRecipients: number; isTest: boolean }> {
  const isTest = !!(input.testRecipients && input.testRecipients.length > 0);
  const recipients: Array<{ name: string; email: string }> = isTest
    ? input.testRecipients!
    : (await prisma.donor.findMany({
        where: { unsubscribed: false, email: { contains: "@" } },
        select: { name: true, email: true },
      }));

  if (recipients.length === 0) {
    throw new Error(isTest
      ? "Test recipient list is empty — edit TEST_ANNOUNCEMENT_RECIPIENTS in lib/trust.ts."
      : "No opted-in donors to send to.");
  }

  return prisma.$transaction(async (tx) => {
    const a = await tx.causeAnnouncement.create({
      data: {
        causeId: input.causeId,
        sentByUserId: input.sentByUserId,
        subject: input.subject,
        totalRecipients: recipients.length,
        isTest,
        status: "PENDING",
      },
    });
    await tx.announcementRecipient.createMany({
      data: recipients.map((d) => ({
        announcementId: a.id,
        donorEmail: d.email,
        donorName: d.name,
        unsubscribeToken: makeUnsubscribeToken(d.email),
      })),
      skipDuplicates: true,
    });
    return { id: a.id, totalRecipients: recipients.length, isTest };
  });
}

// ---------- Batch send ----------

export async function processNextBatch(announcementId: string, opts: { origin: string }): Promise<{
  processed: number;
  sent: number;
  failed: number;
  remaining: number;
  status: "PENDING" | "SENDING" | "COMPLETED" | "CANCELLED";
}> {
  const a = await prisma.causeAnnouncement.findUnique({
    where: { id: announcementId },
    include: {
      cause: {
        select: {
          title: true, slug: true, summary: true, featuredImage: true, contentHtml: true,
          // Pull the cause's latest timeline entry — for follow-up causes this is the
          // freshly-added "new entry" that the admin wrote when continuing the
          // campaign. We use its body as the email's narrative.
          updates: {
            orderBy: { sortOrder: "desc" },
            take: 1,
            select: { body: true },
          },
        },
      },
    },
  });
  if (!a) throw new Error("Announcement not found.");
  if (a.status === "COMPLETED" || a.status === "CANCELLED") {
    return { processed: 0, sent: 0, failed: 0, remaining: 0, status: a.status };
  }

  const batch = await prisma.announcementRecipient.findMany({
    where: { announcementId, status: "PENDING" },
    take: BATCH_SIZE,
    orderBy: { id: "asc" },
  });

  if (batch.length === 0) {
    // No more pending — mark completed.
    await prisma.causeAnnouncement.update({
      where: { id: announcementId },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    return { processed: 0, sent: 0, failed: 0, remaining: 0, status: "COMPLETED" };
  }

  // First batch flips status from PENDING → SENDING.
  if (a.status === "PENDING") {
    await prisma.causeAnnouncement.update({
      where: { id: announcementId },
      data: { status: "SENDING" },
    });
  }

  const causeInput: AnnouncementCauseInput = {
    slug: a.cause.slug,
    title: a.cause.title,
    summary: pickSummary({ summary: a.cause.summary, contentHtml: a.cause.contentHtml, latestUpdateBody: a.cause.updates[0]?.body ?? null }),
    featuredImage: a.cause.featuredImage,
  };

  let sent = 0;
  let failed = 0;
  // Send sequentially with a small inter-message delay. At ~500-800ms per Gmail
  // send + 200ms wait we land around 50-70 sends per minute — within the user's
  // 50/min target and avoids hitting per-second SMTP throughput caps.
  for (const r of batch) {
    try {
      const html = renderAnnouncementHtml({ cause: causeInput, origin: opts.origin, recipientEmail: r.donorEmail, unsubscribeToken: r.unsubscribeToken });
      const text = renderAnnouncementText({ cause: causeInput, origin: opts.origin, recipientEmail: r.donorEmail, unsubscribeToken: r.unsubscribeToken });
      const result = await sendEmail({ to: r.donorEmail, subject: safeHeader(a.subject), html, text });
      if (result.ok) {
        await prisma.announcementRecipient.update({
          where: { id: r.id },
          data: { status: "SENT", sentAt: new Date(), error: null },
        });
        sent++;
      } else {
        await prisma.announcementRecipient.update({
          where: { id: r.id },
          data: { status: "FAILED", error: result.reason },
        });
        failed++;
      }
    } catch (e) {
      await prisma.announcementRecipient.update({
        where: { id: r.id },
        data: { status: "FAILED", error: e instanceof Error ? e.message : String(e) },
      });
      failed++;
    }
    // Inter-message courtesy pause — keeps us under Gmail's per-second throughput.
    await new Promise((r) => setTimeout(r, 200));
  }

  await prisma.causeAnnouncement.update({
    where: { id: announcementId },
    data: { successCount: { increment: sent }, failureCount: { increment: failed } },
  });

  const remaining = await prisma.announcementRecipient.count({
    where: { announcementId, status: "PENDING" },
  });

  let finalStatus: "PENDING" | "SENDING" | "COMPLETED" | "CANCELLED" = "SENDING";
  if (remaining === 0) {
    await prisma.causeAnnouncement.update({
      where: { id: announcementId },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    finalStatus = "COMPLETED";
  }

  return { processed: batch.length, sent, failed, remaining, status: finalStatus };
}

// Pick the narrative text for the announcement body. Order of preference:
//   1. The cause's latest timeline entry body — that's the fresh "new entry"
//      the admin just wrote when continuing a campaign (the most common case).
//   2. Cause.summary if it has at least ~80 chars (a real paragraph).
//   3. First paragraph of contentHtml stripped of tags.
//   4. Fallback string pointing to the cause page.
function pickSummary(c: { summary: string | null; contentHtml: string | null; latestUpdateBody: string | null }): string {
  const latest = (c.latestUpdateBody ?? "").trim();
  if (latest) return latest;
  const s = (c.summary ?? "").trim();
  if (s.length >= 80) return s;
  const html = (c.contentHtml ?? "").trim();
  if (html) {
    const firstPara = html.split(/<\/p>/i)[0] ?? html;
    const text = firstPara.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (text.length > s.length) return text;
  }
  return s || "(see the cause page for full details)";
}

// Used as a Prisma include shape elsewhere if needed.
export const ANNOUNCEMENT_PROGRESS_SELECT = {
  id: true,
  causeId: true,
  subject: true,
  totalRecipients: true,
  successCount: true,
  failureCount: true,
  status: true,
  isTest: true,
  startedAt: true,
  completedAt: true,
} satisfies Prisma.CauseAnnouncementSelect;
