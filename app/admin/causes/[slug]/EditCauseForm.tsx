"use client";

import { useActionState, useState } from "react";
import { updateCauseAction, type EditCauseFormState } from "../actions";

const inputCls =
  "w-full rounded-lg border border-[var(--color-line)] focus:border-accent-600 focus:ring-2 focus:ring-accent-100 outline-none px-3 py-2.5 text-sm";

function slugCleanDuringTyping(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-{2,}/g, "-").slice(0, 80);
}

// Featured-image field for editing: shows the currently-stored image, lets the
// admin pick a replacement (previewed client-side before upload) or clear it.
// The hidden `image` input carries the current URL through as the fallback; if
// a file is picked the server action uploads it and overrides this URL, and if
// "Remove" is ticked the hidden input is blanked so the cause ends up imageless.
function FeaturedImageField({ currentUrl }: { currentUrl: string | null }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentUrl);
  const [pickedFromFile, setPickedFromFile] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) { setError("Image is larger than 2 MB. Compress and try again."); e.target.value = ""; return; }
    if (!["image/jpeg", "image/png", "image/webp"].includes(f.type)) { setError("JPG, PNG, or WebP only."); e.target.value = ""; return; }
    const url = URL.createObjectURL(f);
    setPreviewUrl(url);
    setPickedFromFile(true);
    setRemoved(false);
  }

  // The URL the server should keep if no new file is uploaded: empty when the
  // admin ticked "remove", otherwise the existing stored URL.
  const carryUrl = removed ? "" : (currentUrl ?? "");
  const showPreview = !removed && previewUrl;

  return (
    <div>
      <label className="block text-sm font-semibold text-ink mb-2">Featured image</label>
      <input type="hidden" name="image" value={carryUrl} />
      <div className="flex items-start gap-4">
        {showPreview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl!} alt="Featured preview" className="w-40 aspect-[16/9] object-cover rounded-lg border border-[var(--color-line)] bg-[var(--color-soft)]" />
        ) : (
          <div className="w-40 aspect-[16/9] rounded-lg border border-dashed border-[var(--color-line)] bg-[var(--color-soft)] flex items-center justify-center text-xs text-muted">No image</div>
        )}
        <div className="flex-1 space-y-2">
          <input
            type="file"
            name="featuredImageFile"
            accept="image/jpeg,image/png,image/webp"
            onChange={onFile}
            className="block text-sm text-ink file:mr-3 file:rounded-md file:border file:border-[var(--color-line)] file:bg-[var(--color-soft)] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-ink hover:file:border-ink"
          />
          <p className="text-xs text-muted leading-relaxed">
            Recommended: <strong className="text-ink">1200×675 px</strong> (16:9), JPG or WebP, under 2 MB.
            {currentUrl && !pickedFromFile && !removed && <> Pick a file above to replace the current image.</>}
          </p>
          {currentUrl && (
            <label className="inline-flex items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={removed}
                onChange={(e) => { setRemoved(e.target.checked); if (e.target.checked) setPickedFromFile(false); }}
              />
              Remove current image
            </label>
          )}
          {error && <p className="text-xs text-accent-700">{error}</p>}
        </div>
      </div>
    </div>
  );
}

export type EditCauseInitial = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  goalAmount: number;
  featuredImage: string | null;
  beneficiaryKey: string;
  category: string;
  location: string;
  startDateISO: string | null; // YYYY-MM-DD or null
};

export default function EditCauseForm({ cause }: { cause: EditCauseInitial }) {
  const [state, formAction, pending] = useActionState<EditCauseFormState, FormData>(updateCauseAction, {});
  const [slug, setSlug] = useState(cause.slug);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="id" value={cause.id} />

      <div>
        <label className="block text-sm font-semibold text-ink mb-2">Title *</label>
        <input type="text" name="title" required defaultValue={cause.title} className={inputCls} />
      </div>

      <div>
        <label className="block text-sm font-semibold text-ink mb-2">URL slug *</label>
        <div className="flex items-stretch border border-[var(--color-line)] rounded-lg overflow-hidden focus-within:border-accent-600 focus-within:ring-2 focus-within:ring-accent-100">
          <span className="bg-[var(--color-soft)] text-muted text-sm px-3 py-2.5 border-r border-[var(--color-line)] whitespace-nowrap">/donations/</span>
          <input
            type="text"
            name="slug"
            required
            value={slug}
            onChange={(e) => setSlug(slugCleanDuringTyping(e.target.value))}
            className="flex-1 outline-none px-3 py-2.5 text-sm font-mono"
          />
        </div>
        <p className="text-xs text-muted mt-1">Lowercase letters, numbers, and hyphens. Must be unique.</p>
        {slug !== cause.slug && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
            Changing the slug changes the public URL. Old links to
            <code className="font-mono"> /donations/{cause.slug}</code> will stop working unless a redirect is added.
          </p>
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-ink mb-2">Start date</label>
          <input type="date" name="date" defaultValue={cause.startDateISO ?? ""} className={inputCls} />
          <p className="text-xs text-muted mt-1">The cause&rsquo;s start date. Timeline entry dates are edited separately.</p>
        </div>
        <div>
          <label className="block text-sm font-semibold text-ink mb-2">Place</label>
          <input type="text" name="location" defaultValue={cause.location} className={inputCls} placeholder="e.g. Pala, Kerala" />
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-ink mb-2">Amount (goal, ₹)</label>
        <input type="number" name="goal" min={0} step={500} defaultValue={cause.goalAmount || ""} className={inputCls} placeholder="50000" />
        <p className="text-xs text-muted mt-1">Set to <strong className="text-ink">0</strong> for an informational-only cause (no progress bar or donate widget).</p>
      </div>

      <FeaturedImageField currentUrl={cause.featuredImage} />

      <div>
        <label className="block text-sm font-semibold text-ink mb-2">Summary</label>
        <textarea name="summary" rows={3} defaultValue={cause.summary} className={`${inputCls} resize-y`} placeholder="Short blurb shown in cause listings (optional)." />
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-ink mb-2">Beneficiary group</label>
          <input type="text" name="beneficiaryKey" defaultValue={cause.beneficiaryKey} className={`${inputCls} font-mono`} placeholder="e.g. saniya" />
          <p className="text-xs text-muted mt-1">Causes sharing a key nest under one beneficiary on the public site.</p>
        </div>
        <div>
          <label className="block text-sm font-semibold text-ink mb-2">Category</label>
          <input type="text" name="category" defaultValue={cause.category} className={inputCls} placeholder="e.g. Medical" />
        </div>
      </div>

      {state.error && (
        <p className="text-sm text-accent-700 bg-accent-50 border border-accent-200 rounded-lg px-3 py-2">{state.error}</p>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-full bg-accent-600 hover:bg-accent-700 disabled:opacity-60 text-white font-semibold px-6 py-3 transition"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
        <a href={`/admin/causes/${cause.slug}`} className="text-sm font-semibold text-muted hover:text-ink">Cancel</a>
      </div>
    </form>
  );
}
