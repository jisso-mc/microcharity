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
import type { Prisma, AnnouncementStatus } from "@prisma/client";
import { prisma } from "./prisma";
import { sendEmail, safeHeader } from "./email";

// How long a single process() invocation is allowed to keep sending before it
// stops and returns cleanly. Kept comfortably under the route's maxDuration (60s)
// so the function always finishes on its own terms and returns valid JSON, rather
// than being killed mid-flight by the platform (which returns a non-JSON error
// page and used to crash the client poller).
export const BATCH_TIME_BUDGET_MS = 40_000;
// Recipients pulled per DB round-trip inside the time-boxed loop. Small so progress
// is written frequently — if the function is cut short, at most this many sends are
// unaccounted for and simply get retried (as PENDING) on the next invocation.
export const SEND_CHUNK = 10;
// Courtesy pause between messages — keeps us under Gmail's per-second throughput.
const INTER_MESSAGE_MS = 120;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
  // The FIRST paragraph of the cause page's opening narrative (the earliest
  // timeline entry, else the summary). Chosen by the caller via firstParagraph().
  summary: string;
  featuredImage: string | null;
  goalAmount: number;       // the cause's fund-request goal, in INR rupees (0 = informational)
};

// Currency label for the fund-request line — rupee symbol + Indian digit grouping,
// e.g. ₹50,000. Matches the site's inrShort/₹ convention.
const fmtINR = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

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
  // recipientId is the AnnouncementRecipient row id; absent only for
  // unit-test renders. When present we wrap CTAs with the click-tracker
  // and append the open-tracking pixel.
  recipientId?: string;
}): string {
  const causeUrl = `${opts.origin}/donations/${opts.cause.slug}`;
  const supportUrl = `${opts.origin}/donations/support-microcharity`;
  const unsubUrl = `${opts.origin}/unsubscribe?email=${encodeURIComponent(opts.recipientEmail)}&token=${opts.unsubscribeToken}`;
  const logoUrl = `${opts.origin}/logo.jpg`;
  const mailerImageUrl = `${opts.origin}/mailer-image.jpg`;
  // Wrap clickable destinations in the click-tracker. Unsubscribe link is
  // intentionally NOT wrapped — donors hitting it shouldn't get counted as
  // engaged clicks (it's an opt-out, not an engagement). Image src URLs
  // (logo, mailer banner) also stay direct so they're cacheable.
  const track = (url: string) =>
    opts.recipientId
      ? `${opts.origin}/api/announcement/click/${opts.recipientId}?to=${encodeURIComponent(url)}`
      : url;
  const causeTrack = track(causeUrl);
  const supportTrack = track(supportUrl);
  // The open-tracking pixel. Placed last in the body so the rest of the
  // email is fully rendered before clients fetch the image (some lazy
  // load by position). 1×1 transparent GIF; display:block prevents the
  // tiny anchor-line artifact in some webmail clients.
  const openPixel = opts.recipientId
    ? `<img src="${opts.origin}/api/announcement/open/${opts.recipientId}" width="1" height="1" alt="" style="display:block;border:0;width:1px;height:1px;" />`
    : "";

  // Body of the cause section: the first paragraph from the cause page. It's a
  // single paragraph, so we only need to preserve any single line breaks within it.
  const summaryHtml = esc(opts.cause.summary).replace(/\n/g, "<br/>");
  // Fund-request line shown immediately below the description. Skipped for
  // informational-only causes (goal = 0), where a "₹0" figure would be wrong.
  const fundLineHtml = opts.cause.goalAmount > 0
    ? `<p style="margin:0 0 16px;font-size:15px;color:#1d1a1a;font-weight:600;">MicroCharity Approves Fund request of ${fmtINR(opts.cause.goalAmount)}</p>`
    : "";

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
            ? `<p style="margin:0 0 16px;"><a href="${causeTrack}" style="display:block;"><img src="${opts.cause.featuredImage}" alt="${esc(opts.cause.title)}" style="max-width:100%;height:auto;display:block;border:0;border-radius:8px;" /></a></p>`
            : ""
          }
          <h2 style="margin:0 0 12px;font-size:22px;font-weight:600;line-height:1.3;">
            <a href="${causeTrack}" style="color:#2a7fb8;text-decoration:underline;">${esc(opts.cause.title)}</a>
          </h2>
          <p style="margin:0 0 16px;font-size:14px;color:#3b3838;line-height:1.6;">
            ${summaryHtml}
          </p>
          ${fundLineHtml}
          <p style="margin:0 0 24px;">
            <a href="${causeTrack}" style="display:inline-block;background:#cc2222;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 28px;border-radius:6px;font-size:15px;">Donate Now</a>
          </p>
        </td></tr>

        <!-- Support MicroCharity boilerplate -->
        <tr><td style="padding:8px 24px 0;border-top:1px solid #e7e3df;">
          <h2 style="margin:18px 0 12px;font-size:20px;font-weight:600;color:#2a7fb8;">
            <a href="${supportTrack}" style="color:#2a7fb8;text-decoration:underline;">Support MicroCharity</a>
          </h2>
          <p style="margin:0 0 16px;font-size:14px;color:#3b3838;line-height:1.6;">
            All our administrative expenses are absorbed by MicroCharity volunteers. That gives us
            the unique tag of <em>'zero-expense charity'</em> where every penny of the donor reaches
            the needy. Would you like to donate towards our running expenses? Please do!
          </p>
          <p style="margin:0 0 24px;">
            <a href="${supportTrack}" style="display:inline-block;background:#cc2222;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 28px;border-radius:6px;font-size:15px;">Donate Now</a>
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
  ${openPixel}
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
  const fundLine = opts.cause.goalAmount > 0
    ? `MicroCharity Approves Fund request of ${fmtINR(opts.cause.goalAmount)}\n\n`
    : "";
  return (
    `MicroCharity Announces Support for a new cause\n\n` +
    `${opts.cause.title}\n${causeUrl}\n\n` +
    `${opts.cause.summary}\n\n` +
    fundLine +
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
        where: { unsubscribed: false, deletedAt: null, email: { contains: "@" } },
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

// ---------- Progress (true counts) ----------

export type AnnouncementProgress = {
  id: string;
  subject: string;
  status: AnnouncementStatus;
  totalRecipients: number;
  successCount: number;   // recipients actually SENT (source of truth: recipient rows)
  failureCount: number;   // recipients FAILED
  pendingCount: number;   // recipients still to send
  openCount: number;
  clickCount: number;
  isTest: boolean;
  startedAt: string;
  completedAt: string | null;
};

// Count recipients by status straight from the AnnouncementRecipient rows. These
// per-recipient rows are the source of truth — each is flipped to SENT/FAILED the
// instant its email resolves, so they stay accurate even if a process() invocation
// is cut short before it can roll the totals up onto the parent row.
async function recipientCounts(announcementId: string): Promise<{ sent: number; failed: number; pending: number }> {
  const grouped = await prisma.announcementRecipient.groupBy({
    by: ["status"],
    where: { announcementId },
    _count: { _all: true },
  });
  let sent = 0, failed = 0, pending = 0;
  for (const g of grouped) {
    if (g.status === "SENT") sent = g._count._all;
    else if (g.status === "FAILED") failed = g._count._all;
    else if (g.status === "PENDING") pending = g._count._all;
  }
  return { sent, failed, pending };
}

// Read-only progress snapshot with reconciled (true) counts. Used by the status
// endpoint the panel polls every few seconds, so the numbers never freeze or lie
// even if a batch crashed halfway.
export async function getAnnouncementProgress(announcementId: string): Promise<AnnouncementProgress | null> {
  const a = await prisma.causeAnnouncement.findUnique({
    where: { id: announcementId },
    select: {
      id: true, subject: true, status: true, totalRecipients: true,
      openCount: true, clickCount: true, isTest: true, startedAt: true, completedAt: true,
    },
  });
  if (!a) return null;
  const c = await recipientCounts(announcementId);
  return {
    id: a.id,
    subject: a.subject,
    status: a.status,
    totalRecipients: a.totalRecipients,
    successCount: c.sent,
    failureCount: c.failed,
    pendingCount: c.pending,
    openCount: a.openCount,
    clickCount: a.clickCount,
    isTest: a.isTest,
    startedAt: a.startedAt.toISOString(),
    completedAt: a.completedAt?.toISOString() ?? null,
  };
}

// Persist the reconciled counts + derived status onto the parent row, and return a
// fresh progress snapshot. Called at the end of every batch (and when there's
// nothing to do) so the stored totals converge on the truth.
async function reconcile(announcementId: string): Promise<AnnouncementProgress> {
  const c = await recipientCounts(announcementId);
  const current = await prisma.causeAnnouncement.findUniqueOrThrow({
    where: { id: announcementId }, select: { status: true },
  });
  // Never resurrect a cancelled send. Otherwise: done when nothing is pending.
  let status: AnnouncementStatus = current.status;
  let completedAt: Date | null | undefined = undefined;
  if (current.status !== "CANCELLED") {
    if (c.pending === 0 && c.sent + c.failed > 0) {
      status = "COMPLETED";
      completedAt = new Date();
    } else if (c.pending > 0) {
      status = "SENDING";
      completedAt = null;
    }
  }
  await prisma.causeAnnouncement.update({
    where: { id: announcementId },
    data: {
      successCount: c.sent,
      failureCount: c.failed,
      status,
      ...(completedAt !== undefined ? { completedAt } : {}),
    },
  });
  return (await getAnnouncementProgress(announcementId))!;
}

// ---------- Batch send ----------

// Drain PENDING recipients for up to BATCH_TIME_BUDGET_MS, then return reconciled
// progress. Design goals (all learned from a live incident):
//   * Fail-proof: every recipient send is wrapped individually — one bad address
//     or SMTP hiccup is recorded as FAILED and we move on, never aborting the run.
//   * Never times out uncleanly: we stop sending once the time budget elapses and
//     return normally, so the HTTP response is always valid JSON (the old fixed
//     50-batch could outlast the platform limit → non-JSON error → dead poller).
//   * Resumable: progress is written per-recipient, so a cut-short run loses
//     nothing — the next call just picks up the remaining PENDING rows.
//   * Idempotent-ish: already-SENT recipients are never selected again, so
//     resuming can't re-email someone who already received it.
export async function processNextBatch(announcementId: string, opts: { origin: string }): Promise<AnnouncementProgress> {
  const a = await prisma.causeAnnouncement.findUnique({
    where: { id: announcementId },
    include: {
      cause: {
        select: {
          title: true, slug: true, summary: true, featuredImage: true, contentHtml: true,
          goalAmount: true,
          // Pull the cause's FIRST timeline entry (sortOrder asc) — that's the
          // opening narrative a visitor reads at the top of the public cause page.
          // We use the first paragraph of its body as the email's description.
          updates: {
            orderBy: { sortOrder: "asc" },
            take: 1,
            select: { body: true },
          },
        },
      },
    },
  });
  if (!a) throw new Error("Announcement not found.");
  // Cancelled sends are terminal; completed ones have nothing to do. Return the
  // reconciled snapshot either way so callers always get consistent numbers.
  if (a.status === "CANCELLED") return (await getAnnouncementProgress(announcementId))!;

  // Flip PENDING → SENDING up front so the UI shows "sending" immediately.
  if (a.status === "PENDING") {
    await prisma.causeAnnouncement.update({
      where: { id: announcementId },
      data: { status: "SENDING" },
    });
  }

  const causeInput: AnnouncementCauseInput = {
    slug: a.cause.slug,
    title: a.cause.title,
    summary: firstParagraph({ summary: a.cause.summary, contentHtml: a.cause.contentHtml, firstUpdateBody: a.cause.updates[0]?.body ?? null }),
    featuredImage: a.cause.featuredImage,
    goalAmount: a.cause.goalAmount,
  };

  const deadline = Date.now() + BATCH_TIME_BUDGET_MS;

  // Time-boxed drain loop. Re-query PENDING in small chunks so we always see the
  // latest state and write progress frequently.
  while (Date.now() < deadline) {
    const chunk = await prisma.announcementRecipient.findMany({
      where: { announcementId, status: "PENDING" },
      take: SEND_CHUNK,
      orderBy: { id: "asc" },
    });
    if (chunk.length === 0) break; // nothing left — done

    for (const r of chunk) {
      if (Date.now() >= deadline) break; // out of time — stop cleanly, rest stays PENDING
      try {
        const html = renderAnnouncementHtml({ cause: causeInput, origin: opts.origin, recipientEmail: r.donorEmail, unsubscribeToken: r.unsubscribeToken, recipientId: r.id });
        const text = renderAnnouncementText({ cause: causeInput, origin: opts.origin, recipientEmail: r.donorEmail, unsubscribeToken: r.unsubscribeToken });
        const result = await sendEmail({ to: r.donorEmail, subject: safeHeader(a.subject), html, text });
        await prisma.announcementRecipient.update({
          where: { id: r.id },
          data: result.ok
            ? { status: "SENT", sentAt: new Date(), error: null }
            : { status: "FAILED", error: result.reason.slice(0, 500) },
        });
      } catch (e) {
        // Any unexpected failure (SMTP timeout, bad address, DB blip on this row)
        // is isolated to this recipient — record it and keep going.
        try {
          await prisma.announcementRecipient.update({
            where: { id: r.id },
            data: { status: "FAILED", error: (e instanceof Error ? e.message : String(e)).slice(0, 500) },
          });
        } catch (inner) {
          console.error("[announcements] failed to mark recipient FAILED", r.id, inner);
        }
      }
      await sleep(INTER_MESSAGE_MS);
    }
  }

  return reconcile(announcementId);
}

// Return just the leading paragraph of a block of body text — split on a blank
// line (the same paragraph delimiter the public cause page uses) and take the
// first non-empty chunk.
function leadingParagraph(text: string): string {
  return text
    .split(/\r?\n\r?\n/)
    .map((p) => p.trim())
    .find((p) => p.length > 0) ?? text.trim();
}

// Pick the FIRST paragraph shown at the top of the public cause page, for use as
// the announcement body. Order of preference mirrors what the page renders first:
//   1. The cause's first timeline entry body (sortOrder asc) — the opening narrative.
//   2. Cause.summary.
//   3. First paragraph of contentHtml stripped of tags.
//   4. Fallback string pointing to the cause page.
// In every case only the leading paragraph is returned.
function firstParagraph(c: { summary: string | null; contentHtml: string | null; firstUpdateBody: string | null }): string {
  const first = (c.firstUpdateBody ?? "").trim();
  if (first) return leadingParagraph(first);
  const s = (c.summary ?? "").trim();
  if (s) return leadingParagraph(s);
  const html = (c.contentHtml ?? "").trim();
  if (html) {
    const firstPara = html.split(/<\/p>/i)[0] ?? html;
    const textOnly = firstPara.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (textOnly) return textOnly;
  }
  return "(see the cause page for full details)";
}

// Used as a Prisma include shape elsewhere if needed.
export const ANNOUNCEMENT_PROGRESS_SELECT = {
  id: true,
  causeId: true,
  subject: true,
  totalRecipients: true,
  successCount: true,
  failureCount: true,
  openCount: true,
  clickCount: true,
  status: true,
  isTest: true,
  startedAt: true,
  completedAt: true,
} satisfies Prisma.CauseAnnouncementSelect;
