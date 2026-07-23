"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { CauseStatus } from "@prisma/client";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { nextMcId, composeCaption } from "@/lib/mcid";
import { retryOnUniqueViolation } from "@/lib/retry";
import { audit } from "@/lib/audit";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  return user;
}

// Returns the session userId only if a User row with that id actually exists in this DB.
// Guards against stale JWTs from a previous environment / reseeded prod DB — otherwise
// passing a dangling id to createdById violates Cause_createdById_fkey at insert time.
async function safeCreatorId(userId: string): Promise<string | null> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  return u?.id ?? null;
}

export type CauseFormState = { error?: string; ok?: true };

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

const MONTHS = new Set([
  "jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec",
  "january","february","march","april","june","july","august","september","october","november","december",
  "q1","q2","q3","q4",
]);
function deriveBeneficiaryKey(slug: string): string {
  const parts = slug.split("-");
  while (parts.length > 1) {
    const last = parts[parts.length - 1].toLowerCase();
    if (/^\d{2,4}$/.test(last) || MONTHS.has(last)) parts.pop();
    else break;
  }
  return parts.join("-");
}

export async function deleteCauseUpdateAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  const slug = String(formData.get("slug"));
  await prisma.causeUpdate.delete({ where: { id } });
  revalidatePath(`/admin/causes/${slug}`);
  revalidatePath(`/donations/${slug}`);
}

export type AddUpdateState = { error?: string; ok?: true };
export type UpdateCauseUpdateState = { error?: string; ok?: true };

// Format a YYYY-MM-DD date string as "Mon D, YYYY" to match the caption
// convention used by every existing timeline entry (e.g. "Mar 17, 2025").
function formatCaptionDate(iso: string): string {
  // Parse as a date-only at UTC noon so toLocaleDateString never shifts a day
  // backwards across timezones (admin browsers in IST got off-by-one earlier).
  const d = new Date(`${iso}T12:00:00.000Z`);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

// Add a new timeline entry to a cause. Used after publish to log follow-up
// activity ("Fund Raising Approved", "Fund Raising Closed", progress
// updates, etc.) without having to duplicate the entire cause.
//
// The form has three fields:
//   * date        — YYYY-MM-DD (HTML <input type="date">)
//   * title       — short caption suffix (e.g. "Fund Raising Approved")
//   * description — the body paragraph(s)
//
// Caption is built as "Mon D, YYYY - Title" so the new entry matches the
// formatting of every existing legacy entry.
export async function addCauseUpdateAction(_prev: AddUpdateState, formData: FormData): Promise<AddUpdateState> {
  await requireAdmin();
  const causeId = String(formData.get("causeId") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim();
  const dateRaw = String(formData.get("date") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();

  if (!causeId || !slug) return { error: "Missing cause reference." };
  if (!dateRaw) return { error: "Pick a date for this entry." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) return { error: "Date must be a valid YYYY-MM-DD value." };
  if (!title) return { error: "Title is required (e.g. 'Fund Raising Approved')." };
  if (!body) return { error: "Description is required." };

  const cause = await prisma.cause.findUnique({ where: { id: causeId }, select: { id: true, slug: true } });
  if (!cause || cause.slug !== slug) return { error: "Cause not found." };

  // Append to the end of the timeline. The Cause detail page orders updates
  // by sortOrder asc, so taking max+1 puts this entry below every existing
  // row without renumbering.
  const last = await prisma.causeUpdate.findFirst({
    where: { causeId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const nextSort = (last?.sortOrder ?? -1) + 1;

  await prisma.causeUpdate.create({
    data: {
      causeId,
      caption: `${formatCaptionDate(dateRaw)} - ${title}`,
      body,
      sortOrder: nextSort,
      postedAt: new Date(`${dateRaw}T12:00:00.000Z`),
    },
  });

  revalidatePath(`/admin/causes/${slug}`);
  revalidatePath(`/donations/${slug}`);
  revalidatePath("/current-causes");
  revalidatePath("/success-stories");
  return { ok: true };
}

// Edit an existing timeline entry. Different from add in that it preserves
// the entry's sortOrder and its trailing "(MCID-...)" tag (if any). Admins
// use this when they realise the date / title / body of an existing entry
// is wrong — typical case: a new entry was added with a blank title, so the
// caption shows only the date. Without this action they'd have to delete +
// re-add, which loses the entry's position and timestamps.
export async function updateCauseUpdateAction(_prev: UpdateCauseUpdateState, formData: FormData): Promise<UpdateCauseUpdateState> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim();
  const dateRaw = String(formData.get("date") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();

  if (!id || !slug) return { error: "Missing entry reference." };
  if (!dateRaw) return { error: "Pick a date for this entry." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) return { error: "Date must be a valid YYYY-MM-DD value." };
  if (!title) return { error: "Title is required (e.g. 'Fund Raising Approved')." };
  if (!body) return { error: "Description is required." };

  const existing = await prisma.causeUpdate.findUnique({
    where: { id },
    select: { id: true, caption: true, cause: { select: { slug: true } } },
  });
  if (!existing) return { error: "Entry not found." };
  if (existing.cause.slug !== slug) return { error: "Entry doesn't belong to this cause." };

  // Preserve any "(MCID-...)" suffix from the original caption — the MCID is
  // allocated at create time and is sequence-anchored, so we must not
  // re-issue or drop it on edit. Examples we need to round-trip:
  //   "Aug 01, 2023 - Bangalore, Karnataka(MCID-105-23-24)"
  //   "Jun 10, 2026 (MCID-102-26-27)"
  //   "Aug 4, 2023 - Fund Raising Approved"   (no MCID — leave the new
  //                                            caption MCID-less)
  const mcidMatch = (existing.caption ?? "").match(/\(MCID-[A-Z0-9-]+\)/);
  const mcidSuffix = mcidMatch ? ` ${mcidMatch[0]}` : "";
  const newCaption = `${formatCaptionDate(dateRaw)} - ${title}${mcidSuffix}`;

  await prisma.causeUpdate.update({
    where: { id },
    data: {
      caption: newCaption,
      body,
      postedAt: new Date(`${dateRaw}T12:00:00.000Z`),
    },
  });

  revalidatePath(`/admin/causes/${slug}`);
  revalidatePath(`/donations/${slug}`);
  revalidatePath("/current-causes");
  revalidatePath("/success-stories");
  return { ok: true };
}

export async function createCauseAction(_prev: CauseFormState, formData: FormData): Promise<CauseFormState> {
  const user = await requireAdmin();

  const title = String(formData.get("title") ?? "").trim();
  const slugRaw = String(formData.get("slug") ?? "").trim();
  const summary = String(formData.get("summary") ?? "").trim();
  const story = String(formData.get("story") ?? "").trim();
  // `image` is a fallback URL — pre-filled from the predecessor when continuing a
  // campaign. `featuredImageFile`, if present, takes precedence: uploaded to Vercel
  // Blob below, the resulting public URL replaces `image`.
  let image = String(formData.get("image") ?? "").trim();
  const goalRaw = String(formData.get("goal") ?? "").trim();
  const beneficiaryKey = String(formData.get("beneficiaryKey") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const statusRaw = String(formData.get("status") ?? "DRAFT") as CauseStatus;
  const dateRaw = String(formData.get("date") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();
  const fromSlug = String(formData.get("fromSlug") ?? "").trim(); // predecessor cause we're continuing from
  const date = dateRaw ? new Date(dateRaw) : new Date();
  if (dateRaw && Number.isNaN(date.getTime())) return { error: "Invalid date." };

  if (!title) return { error: "Title is required." };
  if (!slugRaw) return { error: "URL slug is required." };

  const slug = slugify(slugRaw);
  if (!slug) return { error: "Slug must contain at least one letter or number." };

  const goal = goalRaw ? Number(goalRaw) : 0;
  if (goalRaw && (!Number.isFinite(goal) || goal < 0)) return { error: "Goal must be a positive number." };

  const status: CauseStatus = ["DRAFT", "PUBLISHED", "CLOSED"].includes(statusRaw) ? statusRaw : "DRAFT";

  // Slug must be unique
  const clash = await prisma.cause.findUnique({ where: { slug }, select: { id: true } });
  if (clash) return { error: `A cause with slug "${slug}" already exists. Pick a different one.` };

  // Featured image: if admin uploaded a file, push it to Vercel Blob and use that URL.
  // Otherwise keep whatever `image` URL came in (predecessor's, manually pasted, or empty).
  const featuredImageFile = formData.get("featuredImageFile");
  // Trace what came through — earlier bug had Next.js silently strip >1 MB files;
  // logging the size at every create helps catch a future regression fast.
  console.log("[causes/create] featuredImageFile:", {
    isFile: featuredImageFile instanceof File,
    size: featuredImageFile instanceof File ? featuredImageFile.size : 0,
    type: featuredImageFile instanceof File ? featuredImageFile.type : null,
    inheritedImage: image || null,
  });
  if (featuredImageFile instanceof File && featuredImageFile.size > 0) {
    const MAX = 2 * 1024 * 1024; // 2 MB
    const ALLOWED = ["image/jpeg", "image/png", "image/webp"];
    if (featuredImageFile.size > MAX) return { error: "Featured image is larger than 2 MB. Please compress and try again." };
    if (featuredImageFile.type && !ALLOWED.includes(featuredImageFile.type)) {
      return { error: "Featured image must be JPG, PNG, or WebP." };
    }
    try {
      // Use a random suffix (Vercel Blob default) so the URL isn't guessable from the
      // slug. allowOverwrite: false means a typo on a slug never silently clobbers an
      // existing image — the upload fails and the admin gets a clear error.
      const ext = featuredImageFile.name.includes(".") ? featuredImageFile.name.slice(featuredImageFile.name.lastIndexOf(".")) : "";
      const blob = await put(`causes/${slug}/featured${ext}`, featuredImageFile, {
        access: "public",
        contentType: featuredImageFile.type || "image/jpeg",
      });
      image = blob.url;
    } catch (e) {
      console.error("[causes/create] image upload failed", e);
      return { error: "Could not upload the featured image. Try again or paste a URL instead." };
    }
  }

  // If continuing from a predecessor, load its full timeline now so we can copy it
  // onto the new cause inside the transaction below.
  let predecessor: { id: string; beneficiaryKey: string | null; updates: { caption: string | null; body: string; postedAt: Date }[] } | null = null;
  if (fromSlug) {
    predecessor = await prisma.cause.findUnique({
      where: { slug: fromSlug },
      select: {
        id: true,
        beneficiaryKey: true,
        updates: {
          orderBy: { sortOrder: "asc" },
          select: { caption: true, body: true, postedAt: true },
        },
      },
    });
    if (!predecessor) return { error: `Predecessor cause "${fromSlug}" not found.` };
  }

  // Beneficiary key: predecessor wins, then explicit form value, then derived from slug.
  const finalKey = predecessor?.beneficiaryKey || beneficiaryKey || deriveBeneficiaryKey(slug);

  const creatorId = await safeCreatorId(user.userId);

  // Retry on unique-constraint races — both Cause.mcId and the embedded CauseUpdate.mcId
  // share the same generated value, and nextMcId is "max+1 scan" so simultaneous creates
  // from the same FY can collide. Retry picks up the now-incremented max.
  const created = await retryOnUniqueViolation(() => prisma.$transaction(async (tx) => {
    const mcId = await nextMcId(tx, date);
    const initialCaption = composeCaption({
      date,
      heading: location || undefined,
      mcId,
    });

    // Build the full updates payload: predecessor's whole timeline first (sortOrder 0..N-1,
    // mcId set to null because CauseUpdate.mcId is unique — only the original holders own it,
    // the MCID still appears in the caption text), then this cause's own first entry on top.
    const copies = (predecessor?.updates ?? []).map((u, i) => ({
      caption: u.caption,
      body: u.body,
      sortOrder: i,
      postedAt: u.postedAt,
      mcId: null,
    }));
    const newEntrySortOrder = copies.length;
    const newEntry = story
      ? [{
          caption: initialCaption,
          body: story,
          sortOrder: newEntrySortOrder,
          postedAt: date,
          mcId, // same MCID as the cause itself
        }]
      : [];
    const allUpdates = [...copies, ...newEntry];

    return tx.cause.create({
      data: {
        slug,
        title,
        summary: summary || null,
        featuredImage: image || null,
        goalAmount: Math.round(goal),
        raisedAmount: 0,
        status,
        beneficiaryKey: finalKey || null,
        contentHtml: "",
        category: category || null,
        location: location || null,
        startDate: date,
        mcId,
        createdById: creatorId,
        ...(allUpdates.length > 0 ? { updates: { create: allUpdates } } : {}),
      },
    });
  }));

  revalidatePath("/admin/causes");
  revalidatePath("/");
  revalidatePath("/current-causes");
  revalidatePath("/success-stories");
  revalidatePath(`/donations/${created.slug}`);

  redirect(`/admin/causes?created=${created.slug}`);
}

// Edit the core details of an existing cause — the fields that were previously
// only settable at create time (title, slug, goal, featured image, start date,
// place, beneficiary group, category, summary). Timeline entries, status, and
// announcements are managed separately on the cause detail page; this action
// deliberately does NOT touch them.
//
// Slug is editable, but changing it changes the public URL (/donations/<slug>).
// Any external links to the old slug will 404 unless a redirect is added in
// next.config.mjs — the form warns the admin about this. We revalidate both the
// old and new public paths so caches don't serve stale copies at either URL.
export type EditCauseFormState = { error?: string; ok?: true };

export async function updateCauseAction(_prev: EditCauseFormState, formData: FormData): Promise<EditCauseFormState> {
  const user = await requireAdmin();

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { error: "Missing cause reference." };

  const title = String(formData.get("title") ?? "").trim();
  const slugRaw = String(formData.get("slug") ?? "").trim();
  const summary = String(formData.get("summary") ?? "").trim();
  let image = String(formData.get("image") ?? "").trim(); // existing URL, kept unless a new file is uploaded
  const goalRaw = String(formData.get("goal") ?? "").trim();
  const beneficiaryKey = String(formData.get("beneficiaryKey") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();
  const dateRaw = String(formData.get("date") ?? "").trim();

  if (!title) return { error: "Title is required." };
  if (!slugRaw) return { error: "URL slug is required." };

  const slug = slugify(slugRaw);
  if (!slug) return { error: "Slug must contain at least one letter or number." };

  const goal = goalRaw ? Number(goalRaw) : 0;
  if (goalRaw && (!Number.isFinite(goal) || goal < 0)) return { error: "Goal must be a positive number." };

  let startDate: Date | null | undefined = undefined; // undefined = leave unchanged
  if (dateRaw) {
    const d = new Date(`${dateRaw}T12:00:00.000Z`);
    if (Number.isNaN(d.getTime())) return { error: "Invalid start date." };
    startDate = d;
  }

  const existing = await prisma.cause.findUnique({
    where: { id },
    select: { id: true, slug: true, title: true, featuredImage: true },
  });
  if (!existing) return { error: "Cause not found." };

  // Slug uniqueness — only when it actually changed, and excluding this cause.
  if (slug !== existing.slug) {
    const clash = await prisma.cause.findUnique({ where: { slug }, select: { id: true } });
    if (clash && clash.id !== id) return { error: `A cause with slug "${slug}" already exists. Pick a different one.` };
  }

  // Featured image: a freshly-uploaded file wins; otherwise keep the URL that
  // came through the hidden input (the current image, or a cleared/empty value).
  const featuredImageFile = formData.get("featuredImageFile");
  if (featuredImageFile instanceof File && featuredImageFile.size > 0) {
    const MAX = 2 * 1024 * 1024; // 2 MB
    const ALLOWED = ["image/jpeg", "image/png", "image/webp"];
    if (featuredImageFile.size > MAX) return { error: "Featured image is larger than 2 MB. Please compress and try again." };
    if (featuredImageFile.type && !ALLOWED.includes(featuredImageFile.type)) {
      return { error: "Featured image must be JPG, PNG, or WebP." };
    }
    try {
      const ext = featuredImageFile.name.includes(".") ? featuredImageFile.name.slice(featuredImageFile.name.lastIndexOf(".")) : "";
      // addRandomSuffix keeps the URL unguessable and avoids clobbering the prior
      // image, so the old featured URL (if cached anywhere) stays valid.
      const blob = await put(`causes/${slug}/featured${ext}`, featuredImageFile, {
        access: "public",
        addRandomSuffix: true,
        contentType: featuredImageFile.type || "image/jpeg",
      });
      image = blob.url;
    } catch (e) {
      console.error("[causes/update] image upload failed", e);
      return { error: "Could not upload the featured image. Try again or keep the existing one." };
    }
  }

  await prisma.cause.update({
    where: { id },
    data: {
      title,
      slug,
      summary: summary || null,
      featuredImage: image || null,
      goalAmount: Math.round(goal),
      beneficiaryKey: beneficiaryKey || null,
      category: category || null,
      location: location || null,
      ...(startDate !== undefined ? { startDate } : {}),
    },
  });

  await audit({
    action: "cause.update",
    userId: user.userId,
    entityType: "Cause",
    entityId: id,
    payload: { slug, previousSlug: existing.slug, title },
  });

  // Revalidate admin + every public surface, at BOTH the old and new slug so a
  // renamed cause serves fresh content at the new URL and doesn't leave a stale
  // page cached at the old one.
  revalidatePath("/admin/causes");
  revalidatePath(`/admin/causes/${existing.slug}`);
  revalidatePath(`/admin/causes/${slug}`);
  revalidatePath("/");
  revalidatePath("/current-causes");
  revalidatePath("/success-stories");
  revalidatePath(`/donations/${existing.slug}`);
  revalidatePath(`/donations/${slug}`);

  redirect(`/admin/causes/${slug}?updated=1`);
}

export async function setCauseStatusAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  const status = String(formData.get("status")) as CauseStatus;
  if (!["DRAFT", "PUBLISHED", "CLOSED"].includes(status)) {
    throw new Error("Invalid status");
  }

  const cause = await prisma.cause.findUnique({ where: { id }, select: { slug: true } });
  if (!cause) throw new Error("Cause not found");

  await prisma.cause.update({ where: { id }, data: { status } });

  // Refresh both admin views and every public surface that lists causes so the change
  // is visible immediately on the next request.
  revalidatePath("/admin/causes");
  revalidatePath("/");
  revalidatePath("/current-causes");
  revalidatePath("/success-stories");
  revalidatePath(`/donations/${cause.slug}`);
}

// Hard-delete a cause, but ONLY when it has no APPROVED donations. The block
// is about protecting *real* giving history (APPROVED donations have counted
// toward the total and had 80G receipts issued) — not about whether anyone
// ever touched a form. PENDING / FAILED / REJECTED donations represent
// abandoned or un-verified attempts (e.g. a test QR submission that was never
// approved), carry no money, and are exactly the cruft that accumulates on a
// throwaway cause — so they don't block deletion and are removed along with it.
//
// On delete we clear, in one transaction:
//   * non-approved Donation rows — explicit deleteMany (they don't cascade from
//     Cause; their Receipt children cascade from Donation). Safe because we've
//     already refused if any APPROVED donation exists.
//   * CauseAnnouncement rows — NOT auto-cascading, so deleted explicitly (their
//     AnnouncementRecipient children cascade).
//   * the Cause itself — cascades its CauseUpdate timeline entries.
export async function deleteCauseAction(formData: FormData) {
  const user = await requireAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("Missing cause id.");

  const cause = await prisma.cause.findUnique({
    where: { id },
    select: {
      id: true, slug: true, title: true,
      // Count ONLY approved donations — that's what represents real,
      // receipted giving history and must never be silently deleted.
      _count: { select: { donations: { where: { status: "APPROVED" } } } },
    },
  });
  if (!cause) throw new Error("Cause not found.");

  if (cause._count.donations > 0) {
    throw new Error(
      `"${cause.title}" has ${cause._count.donations} approved donation(s) and can't be deleted. Close it instead.`
    );
  }

  await prisma.$transaction(async (tx) => {
    // No APPROVED donations got past the guard above, so every donation on
    // this cause is PENDING / FAILED / REJECTED — remove them (receipts, if
    // any somehow exist, cascade from Donation) so the cause delete doesn't
    // trip the Donation→Cause foreign key.
    await tx.donation.deleteMany({ where: { causeId: id } });
    // Announcements don't cascade from Cause; clear them first. Their
    // recipient rows cascade from CauseAnnouncement automatically.
    await tx.causeAnnouncement.deleteMany({ where: { causeId: id } });
    // Deleting the cause cascades its CauseUpdate timeline entries.
    await tx.cause.delete({ where: { id } });
  });

  await audit({
    action: "cause.delete",
    userId: user.userId,
    entityType: "Cause",
    entityId: id,
    payload: { slug: cause.slug, title: cause.title },
  });

  revalidatePath("/admin/causes");
  revalidatePath("/");
  revalidatePath("/current-causes");
  revalidatePath("/success-stories");
}
