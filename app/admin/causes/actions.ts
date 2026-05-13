"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { CauseStatus } from "@prisma/client";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { nextMcId, composeCaption } from "@/lib/mcid";
import { retryOnUniqueViolation } from "@/lib/retry";

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
