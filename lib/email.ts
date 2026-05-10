// Email sender for transactional / notification mail.
// Uses Gmail SMTP with an App Password (simpler than OAuth for v1).
// Falls back to console logging if SMTP credentials aren't configured —
// keeps the dev experience working before the real Gmail account is wired.

import nodemailer from "nodemailer";

const HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const PORT = Number(process.env.SMTP_PORT || 465);
const USER = process.env.SMTP_USER;        // e.g. info@microcharity.com
const PASS = process.env.SMTP_PASS;        // Gmail App Password (16 chars, no spaces)
const FROM = process.env.SMTP_FROM || `"MicroCharity" <${USER ?? "no-reply@microcharity.com"}>`;

const ADMIN_INBOX = process.env.ADMIN_INBOX || "info@microcharity.com";

function transport() {
  if (!USER || !PASS) return null;
  return nodemailer.createTransport({
    host: HOST,
    port: PORT,
    secure: PORT === 465,
    auth: { user: USER, pass: PASS },
  });
}

export type EmailAttachment = {
  filename: string;
  content: Buffer | Uint8Array;
  contentType?: string;
};

export type SendOptions = {
  to?: string;            // defaults to ADMIN_INBOX
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
};

export async function sendEmail(opts: SendOptions): Promise<{ ok: true; id?: string } | { ok: false; reason: string }> {
  const tx = transport();
  if (!tx) {
    console.log("[email] SMTP not configured — logging instead:", {
      to: opts.to ?? ADMIN_INBOX, subject: opts.subject, replyTo: opts.replyTo,
      attachments: opts.attachments?.map(a => ({ filename: a.filename, size: a.content.length })),
    });
    console.log(opts.text ?? opts.html);
    return { ok: false, reason: "SMTP not configured" };
  }
  const info = await tx.sendMail({
    from: FROM,
    to: opts.to ?? ADMIN_INBOX,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
    replyTo: opts.replyTo,
    attachments: opts.attachments?.map(a => ({
      filename: a.filename,
      content: Buffer.isBuffer(a.content) ? a.content : Buffer.from(a.content),
      contentType: a.contentType,
    })),
  });
  return { ok: true, id: info.messageId };
}

// ---------- Pretty HTML table for form submissions ----------

export type Field = { label: string; value: string };

const ESCAPE: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ESCAPE[c]);

const COLOR_INK = "#1d1a1a";
const COLOR_BODY = "#3b3838";
const COLOR_MUTED = "#6b6363";
const COLOR_LINE = "#e7e3df";
const COLOR_ACCENT = "#cc2222";
const COLOR_SOFT = "#f7f6f4";

export function renderFormEmail(opts: {
  heading: string;
  intro?: string;
  fields: Field[];
  footerNote?: string;
}): { html: string; text: string } {
  const rows = opts.fields
    .filter((f) => f.value && f.value.trim().length > 0)
    .map(
      (f) => `
        <tr>
          <td style="padding:10px 14px;border-bottom:1px solid ${COLOR_LINE};font-size:13px;color:${COLOR_MUTED};font-weight:600;text-transform:uppercase;letter-spacing:.04em;width:200px;vertical-align:top;">${esc(f.label)}</td>
          <td style="padding:10px 14px;border-bottom:1px solid ${COLOR_LINE};font-size:14px;color:${COLOR_INK};white-space:pre-wrap;line-height:1.55;">${esc(f.value).replace(/\n/g, "<br/>")}</td>
        </tr>`
    )
    .join("");

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:${COLOR_SOFT};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:${COLOR_BODY};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLOR_SOFT};padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid ${COLOR_LINE};border-radius:12px;overflow:hidden;">
        <tr><td style="padding:20px 24px;border-bottom:1px solid ${COLOR_LINE};">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:${COLOR_ACCENT};font-weight:700;">MicroCharity</div>
          <div style="font-size:20px;color:${COLOR_INK};font-weight:600;margin-top:4px;">${esc(opts.heading)}</div>
          ${opts.intro ? `<div style="font-size:14px;color:${COLOR_MUTED};margin-top:6px;line-height:1.5;">${esc(opts.intro)}</div>` : ""}
        </td></tr>
        <tr><td>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            ${rows}
          </table>
        </td></tr>
        ${opts.footerNote ? `<tr><td style="padding:14px 24px;background:${COLOR_SOFT};border-top:1px solid ${COLOR_LINE};font-size:12px;color:${COLOR_MUTED};">${esc(opts.footerNote)}</td></tr>` : ""}
      </table>
    </td></tr>
  </table>
</body></html>`;

  const text =
    `${opts.heading}\n` +
    (opts.intro ? `\n${opts.intro}\n` : "") +
    "\n" +
    opts.fields
      .filter((f) => f.value && f.value.trim().length > 0)
      .map((f) => `${f.label}:\n  ${f.value.replace(/\n/g, "\n  ")}`)
      .join("\n\n") +
    (opts.footerNote ? `\n\n— ${opts.footerNote}` : "");

  return { html, text };
}

// ---------- Donation acknowledgment (sent immediately for offline / QR) ----------

export type DonationAckInput = {
  donorName: string;
  donorEmail: string;
  causeTitle: string;
  donationDate: Date;
  amount: number;            // INR
  paymentMethod: string;     // "Offline Donation" | "UPI / QR Code" | "Razorpay"
  paymentId: string;         // internal donation id or external txn ref
};

const fmtINR = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const fmtLongDate = (d: Date) =>
  d.toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" });

export async function sendDonationAck(input: DonationAckInput) {
  const subject = `Thank you for your donation to ${input.causeTitle} - MicroCharity`;
  const firstName = input.donorName.trim().split(/\s+/)[0] || input.donorName;

  const text =
    `Dear ${firstName},\n\n` +
    `Greetings from MicroCharity.com\n\n` +
    `We hereby acknowledge the receipt of your donation. Thank you very much for your donation. ` +
    `Your generosity is highly appreciated! Here are the details of your donation:\n\n` +
    `Donor: ${input.donorName}\n` +
    `Donation: ${input.causeTitle}\n` +
    `Donation Date: ${fmtLongDate(input.donationDate)}\n` +
    `Amount: ${fmtINR(input.amount)}\n` +
    `Payment Method: ${input.paymentMethod}\n` +
    `Payment ID: ${input.paymentId}\n\n` +
    `You will be receiving 80G Donation Receipt of this donation shortly from us.\n\n` +
    `Sincerely,\n\n` +
    `MicroCharity.com`;

  const rows: Field[] = [
    { label: "Donor", value: input.donorName },
    { label: "Donation", value: input.causeTitle },
    { label: "Donation Date", value: fmtLongDate(input.donationDate) },
    { label: "Amount", value: fmtINR(input.amount) },
    { label: "Payment Method", value: input.paymentMethod },
    { label: "Payment ID", value: input.paymentId },
  ];
  const { html } = renderFormEmail({
    heading: "Thank you for your donation",
    intro:
      `Dear ${firstName}, greetings from MicroCharity.com. We hereby acknowledge the receipt of your donation. ` +
      `Your generosity is highly appreciated. You will receive your 80G Donation Receipt shortly.`,
    fields: rows,
    footerNote: "Sincerely, MicroCharity.com",
  });

  return sendEmail({ to: input.donorEmail, subject, html, text });
}

// ---------- 80G receipt email (sent on approval / Razorpay capture) ----------

export type Receipt80GInput = {
  donorName: string;
  donorEmail: string;
  causeTitle: string;
  receiptNumber: string;
  amount: number;
  paymentMethod: string;
  pdf: Buffer | Uint8Array;
};

export async function sendDonationReceipt80G(input: Receipt80GInput) {
  const firstName = input.donorName.trim().split(/\s+/)[0] || input.donorName;
  const subject = `Your 80G Donation Receipt - ${input.receiptNumber}`;

  const text =
    `Dear ${firstName},\n\n` +
    `Thank you for your donation of ${fmtINR(input.amount)} towards "${input.causeTitle}".\n\n` +
    `Your 80G donation receipt is attached as a PDF (Receipt No: ${input.receiptNumber}). ` +
    `This receipt qualifies for tax deduction under section 80G(5) of the Income Tax Act, 1961.\n\n` +
    `Sincerely,\n\nMicroCharity.com`;

  const { html } = renderFormEmail({
    heading: "Your 80G Donation Receipt",
    intro:
      `Dear ${firstName}, thank you for your donation. Your 80G donation receipt is attached as a PDF. ` +
      `It qualifies for tax deduction under section 80G(5) of the Income Tax Act, 1961.`,
    fields: [
      { label: "Receipt No", value: input.receiptNumber },
      { label: "Donation", value: input.causeTitle },
      { label: "Amount", value: fmtINR(input.amount) },
      { label: "Payment Method", value: input.paymentMethod },
    ],
    footerNote: "Sincerely, MicroCharity.com",
  });

  return sendEmail({
    to: input.donorEmail,
    subject,
    html,
    text,
    attachments: [
      {
        filename: `MicroCharity_${input.donorName.replace(/\s+/g, "_")}_${input.receiptNumber.replace(/\s|\//g, "-")}.pdf`,
        content: input.pdf,
        contentType: "application/pdf",
      },
    ],
  });
}

// ---------- Cause-application emails ----------

import type { ApplicationFormType } from "@prisma/client";
import { FORM_TYPE_LABEL, type AttachmentMeta } from "./applications";

export type ApplicationEmailInput = {
  applicationNo: string;
  formType: ApplicationFormType;
  data: Record<string, unknown>;          // the validated payload
  applicantName: string;
  applicantEmail?: string | null;
  applicantPhone: string;
  attachmentMeta: AttachmentMeta[];
  attachments: EmailAttachment[];          // file bytes — forwarded once, never persisted
  submittedAt: Date;
};

const SECTION_LABELS: Record<string, string> = {
  applicant:            "Applicant",
  organization:         "Organization",
  father:               "Father's details",
  mother:               "Mother's details",
  course:               "Course",
  educationHistory:     "Education history",
  fundingRequested:     "Funding requested",
  fundingItems:         "Funding items",
  fundingPurpose:       "Purpose of funding request",
  family:               "Family details",
  annualIncome:         "Annual income of family",
  medicalCircumstances: "Medical circumstances",
  causeCircumstances:   "Cause circumstances",
  totalAmount:          "Total amount of financial assistance required",
  prevAssistance:       "Previously received assistance",
  heardAbout:           "Where heard about the charity",
  reference:            "Reference",
  medicalOfficer:       "Medical officer / certifying doctor",
  ngoDeclarant:         "Local NGO / committee declarant",
  bankDetails:          "Bank account details",
  acknowledgement:      "Applicant acknowledgement",
};

const FIELD_LABELS: Record<string, string> = {
  fullName: "Full name", address: "Address", phone: "Phone", mobile: "Mobile", email: "Email",
  dateOfBirth: "Date of birth", age: "Age", sex: "Sex",
  name: "Name", relationship: "Relationship", occupation: "Occupation",
  contactNumber: "Contact number", contactPerson: "Contact person", contactMobile: "Contact person mobile",
  knownSince: "Known applicant since", description: "Description",
  designation: "Designation", organization: "Organization",
  accountNumber: "A/C number", accountHolderName: "Account holder name", bankName: "Bank",
  branch: "Branch", ifsc: "IFSC code", relationshipIfNotApplicant: "Relationship (if a/c not in applicant's name)",
  title: "Course title", school: "School / Educational establishment",
  fees: "Fees", uniform: "Uniform", books: "Books / stationaries", others: "Others",
  itemName: "Item", nos: "Nos", cost: "Cost",
  fromDate: "From", toDate: "To", achievements: "Achievements",
  fullLegalName: "Full legal name (e-signature)", date: "Date", place: "Place",
  termsAccepted: "Terms accepted",
};

function lbl(k: string) { return FIELD_LABELS[k] ?? k; }
function sectionLbl(k: string) { return SECTION_LABELS[k] ?? k; }

function renderValue(v: unknown): string {
  if (v == null || v === "") return '<span style="color:#999">—</span>';
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return esc(v).replace(/\n/g, "<br/>");
  return esc(JSON.stringify(v));
}

function renderObjectAsRows(obj: Record<string, unknown>): string {
  return Object.entries(obj)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:12px;color:#666;width:200px;vertical-align:top">${esc(lbl(k))}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:13px;color:#1d1a1a;line-height:1.5">${renderValue(v)}</td>
      </tr>
    `).join("");
}

function renderArrayAsTable(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return '<p style="color:#999">No entries.</p>';
  const cols = Array.from(rows.reduce((s, r) => { Object.keys(r).forEach((k) => s.add(k)); return s; }, new Set<string>()));
  const head = cols.map((c) => `<th style="padding:6px 10px;border-bottom:1px solid #ddd;background:#fafafa;text-align:left;font-size:11px;color:#666;text-transform:uppercase;letter-spacing:.04em">${esc(lbl(c))}</th>`).join("");
  const body = rows.map((r) => `<tr>${cols.map((c) => `<td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;font-size:12px;color:#1d1a1a;vertical-align:top">${renderValue(r[c])}</td>`).join("")}</tr>`).join("");
  return `<table style="width:100%;border-collapse:collapse;border:1px solid #ddd;margin:6px 0"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function renderSection(key: string, value: unknown): string {
  const heading = `<h3 style="margin:24px 0 8px;font-size:14px;color:#1d1a1a;border-bottom:2px solid #cc2222;padding-bottom:4px">${esc(sectionLbl(key))}</h3>`;
  if (value == null || value === "") return `${heading}<p style="color:#999;margin:6px 0">—</p>`;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return `${heading}<p style="margin:6px 0;font-size:13px;color:#1d1a1a;line-height:1.5">${renderValue(value)}</p>`;
  }
  if (Array.isArray(value)) {
    return `${heading}${renderArrayAsTable(value as Array<Record<string, unknown>>)}`;
  }
  if (typeof value === "object") {
    return `${heading}<table style="width:100%;border-collapse:collapse;border:1px solid #eee">${renderObjectAsRows(value as Record<string, unknown>)}</table>`;
  }
  return heading;
}

function renderApplicationHtml(input: ApplicationEmailInput): string {
  const sections = Object.entries(input.data).map(([k, v]) => renderSection(k, v)).join("");
  const attachmentsList = input.attachmentMeta.length === 0
    ? '<p style="color:#999;margin:6px 0">No attachments.</p>'
    : `<ul style="margin:6px 0;padding-left:20px;font-size:13px;color:#1d1a1a">${input.attachmentMeta.map((a) => `<li>${esc(a.field)}: ${esc(a.filename)} (${(a.size / 1024).toFixed(0)} KB, ${esc(a.mimeType)})</li>`).join("")}</ul>`;

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f7f6f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#3b3838">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f6f4;padding:24px 0">
    <tr><td align="center">
      <table role="presentation" width="700" cellpadding="0" cellspacing="0" style="max-width:700px;background:#fff;border:1px solid #e7e3df;border-radius:12px;overflow:hidden">
        <tr><td style="padding:20px 24px;border-bottom:1px solid #e7e3df">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#cc2222;font-weight:700">MicroCharity</div>
          <div style="font-size:20px;color:#1d1a1a;font-weight:600;margin-top:4px">New ${esc(FORM_TYPE_LABEL[input.formType])} application</div>
          <div style="font-size:13px;color:#6b6363;margin-top:6px">
            Application No: <strong style="color:#1d1a1a;font-family:monospace">${esc(input.applicationNo)}</strong>
            · Submitted: ${esc(input.submittedAt.toLocaleString("en-IN"))}
          </div>
        </td></tr>
        <tr><td style="padding:16px 24px">
          ${sections}
          <h3 style="margin:24px 0 8px;font-size:14px;color:#1d1a1a;border-bottom:2px solid #cc2222;padding-bottom:4px">Attachments</h3>
          ${attachmentsList}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export async function sendApplicationToAdmin(input: ApplicationEmailInput) {
  const subject = `New ${FORM_TYPE_LABEL[input.formType]} application: ${input.applicationNo} from ${input.applicantName}`;
  const html = renderApplicationHtml(input);
  const text =
    `New ${FORM_TYPE_LABEL[input.formType]} application\n\n` +
    `Application No: ${input.applicationNo}\n` +
    `Applicant: ${input.applicantName}\n` +
    `Phone: ${input.applicantPhone}\n` +
    `Email: ${input.applicantEmail ?? "—"}\n\n` +
    `Open the HTML email or the admin panel for the full filled form.`;
  return sendEmail({
    subject,
    html,
    text,
    replyTo: input.applicantEmail ?? undefined,
    attachments: input.attachments,
  });
}

export async function sendApplicationConfirmation(input: {
  applicationNo: string;
  formType: ApplicationFormType;
  applicantName: string;
  applicantEmail: string;
  attachmentMeta: AttachmentMeta[];
}) {
  const subject = `We received your ${FORM_TYPE_LABEL[input.formType]} application — ${input.applicationNo}`;
  const firstName = input.applicantName.trim().split(/\s+/)[0] || input.applicantName;
  const attachedNote = input.attachmentMeta.length > 0
    ? `We've received the following attachments along with your application:\n` +
      input.attachmentMeta.map((a) => `  • ${a.filename}`).join("\n")
    : `If you haven't yet, please email any supporting documents (photo, signed certificates, reference letter) to info@microcharity.com referencing your application number above.`;

  const text =
    `Dear ${firstName},\n\n` +
    `Thank you for applying to MicroCharity. We've received your ${FORM_TYPE_LABEL[input.formType]} application.\n\n` +
    `Application No: ${input.applicationNo}\n\n` +
    `${attachedNote}\n\n` +
    `Our team will review the application and contact you. Please quote the application number above in any future correspondence.\n\n` +
    `— MicroCharity\nwww.microcharity.com`;

  const html =
    `<p>Dear ${esc(firstName)},</p>` +
    `<p>Thank you for applying to MicroCharity. We've received your <strong>${esc(FORM_TYPE_LABEL[input.formType])}</strong> application.</p>` +
    `<p style="font-size:14px"><strong>Application No:</strong> <code>${esc(input.applicationNo)}</code></p>` +
    (input.attachmentMeta.length > 0
      ? `<p>We've received the following attachments along with your application:</p><ul>${input.attachmentMeta.map((a) => `<li>${esc(a.filename)}</li>`).join("")}</ul>`
      : `<p>If you haven't yet, please email any supporting documents (photo, signed certificates, reference letter) to <a href="mailto:info@microcharity.com">info@microcharity.com</a> referencing your application number above.</p>`) +
    `<p>Our team will review the application and contact you. Please quote the application number above in any future correspondence.</p>` +
    `<p style="color:#6b6363;font-size:13px">— MicroCharity<br/><a href="https://www.microcharity.com">www.microcharity.com</a></p>`;

  return sendEmail({ to: input.applicantEmail, subject, html, text });
}

// ---------- Admin user invite / password reset (one-time link) ----------

// Same one-time link plumbing for "you're invited" and "you forgot your password" — the
// link, expiry, and acceptance page are identical; only the wording differs.
type InviteMode = "invite" | "reset";

export async function sendAdminInvite(input: { name: string; email: string; inviteUrl: string; mode?: InviteMode }) {
  const mode: InviteMode = input.mode ?? "invite";
  const subject =
    mode === "reset"
      ? "Reset your MicroCharity admin password"
      : "You're invited to MicroCharity admin";
  const opening =
    mode === "reset"
      ? "A password reset was requested for your MicroCharity admin account. Open the link below to choose a new password and sign in:"
      : "You've been invited to access the MicroCharity admin panel. Open the link below to set your password and sign in:";
  const text =
    `Hi ${input.name},\n\n` +
    `${opening}\n\n` +
    `${input.inviteUrl}\n\n` +
    `This link will expire in 24 hours. If you didn't expect this email, you can safely ignore it.\n\n` +
    `— MicroCharity`;
  // Plain-text email is intentional — the link is the secret; dressing it up adds nothing
  // and triggers more spam filters than a short message.
  const html =
    `<p>Hi ${input.name},</p>` +
    `<p>${opening}</p>` +
    `<p><a href="${input.inviteUrl}">${input.inviteUrl}</a></p>` +
    `<p style="color:#6b6363;font-size:13px">This link will expire in 24 hours. If you didn't expect this email, you can safely ignore it.</p>` +
    `<p>— MicroCharity</p>`;
  return sendEmail({ to: input.email, subject, html, text });
}
