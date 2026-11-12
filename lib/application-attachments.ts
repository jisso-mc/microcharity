// Server-side helpers for application attachments stored on Vercel Blob:
// download them (for the admin email copy and the backup PDF) and delete them
// (when an admin deletes an application).

import { del } from "@vercel/blob";
import type { ApplicationFormType } from "@prisma/client";
import type { AttachmentMeta } from "./applications";
import type { EmailAttachment } from "./email";
import { attachmentLabel } from "./application-fields";

// Copy files into the admin email only up to this combined size — beyond it the
// email lists links instead (Gmail SMTP fallback rejects messages over ~25 MB).
const EMAIL_ATTACH_BUDGET = 15 * 1024 * 1024;

/** Download a stored attachment. Returns null (and logs) on failure. */
export async function fetchAttachment(a: AttachmentMeta): Promise<Buffer | null> {
  if (!a.url) return null;
  try {
    const res = await fetch(a.url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  } catch (e) {
    console.error("[application-attachments] fetch failed", a.url, e);
    return null;
  }
}

/** Files to attach to the admin notification email, within the size budget. */
export async function fetchAttachmentsForEmail(
  formType: ApplicationFormType,
  meta: AttachmentMeta[],
): Promise<EmailAttachment[]> {
  const out: EmailAttachment[] = [];
  let total = 0;
  for (const a of meta) {
    if (total + a.size > EMAIL_ATTACH_BUDGET) continue;
    const buf = await fetchAttachment(a);
    if (!buf) continue;
    total += buf.length;
    // Prefix with the slot label so the admin can tell "Photo" from "Govt ID".
    const label = attachmentLabel(formType, a.field).replace(/[^A-Za-z0-9 .&-]+/g, "").trim().slice(0, 40);
    out.push({ filename: `${label} - ${a.filename}`, content: buf, contentType: a.mimeType });
  }
  return out;
}

/** Best-effort delete of every stored file for an application. */
export async function deleteAttachments(meta: AttachmentMeta[]): Promise<void> {
  const urls = meta.map((a) => a.url).filter((u): u is string => !!u);
  if (urls.length === 0) return;
  try { await del(urls); } catch (e) { console.error("[application-attachments] delete failed", e); }
}
