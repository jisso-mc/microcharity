"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { updateCauseUpdateAction, type UpdateCauseUpdateState } from "../actions";

// Toggle between display and edit modes for a single timeline entry.
// Display mode: small "Edit" link beside the existing Delete button.
// Edit mode: inline form with date / title / body inputs, prefilled from the
// existing entry. Save submits the updateCauseUpdateAction; Cancel reverts
// to display without writing anything.
//
// The parent (cause detail page) renders the entry's caption + body for
// display; this component only contributes the Edit button OR the edit
// form, depending on state. The form replaces the display markup when
// open by rendering inline above its toggle position — the parent passes
// the full entry data so the form can prefill correctly.

type Props = {
  id: string;
  slug: string;
  // The full existing caption like "Mon D, YYYY - Title (MCID-…)". We parse
  // the date and title out of it for the form's default values; the MCID
  // (if present) is preserved server-side automatically.
  caption: string;
  body: string;
  postedAt: string; // ISO date string from the server
};

export default function EditTimelineEntryButton({
  id,
  slug,
  caption,
  body,
  postedAt,
}: Props) {
  const [open, setOpen] = useState(false);
  const initial: UpdateCauseUpdateState = {};
  const [state, action] = useActionState(updateCauseUpdateAction, initial);

  // Close the form once a save succeeds. The revalidatePath in the action
  // re-renders the parent with the new entry, so we no longer need the form.
  useEffect(() => {
    if (state?.ok) setOpen(false);
  }, [state]);

  // Default date for the date input: the entry's postedAt. The DB stores it
  // at 12:00 UTC so timezone shifts can't push it across midnight, but we
  // still need to slice to YYYY-MM-DD for the <input type="date"/>.
  const defaultDate = (postedAt || "").slice(0, 10);

  // The caption looks like "Aug 4, 2023 - Fund Raising Approved (MCID-…)" or
  // "Jun 10, 2026 (MCID-102-26-27)" (no separator when title was blank at
  // creation). Extract just the title portion for the form — strip the
  // leading date and the trailing "(MCID-…)" if present.
  function extractTitleFromCaption(c: string): string {
    if (!c) return "";
    // Drop the trailing (MCID-...) tag first.
    let s = c.replace(/\s*\(MCID-[A-Z0-9-]+\)\s*$/, "").trim();
    // Drop the leading date portion. Captions use "Mon D, YYYY - " as
    // separator OR sometimes "DD-Mon-YYYY - " — match both, then take what
    // comes after the first " - ". If there's no " - ", the title was blank
    // at creation, so we return "" and let the admin type in the right one.
    const sepIdx = s.indexOf(" - ");
    if (sepIdx === -1) return "";
    return s.slice(sepIdx + 3).trim();
  }
  const defaultTitle = extractTitleFromCaption(caption);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-semibold text-muted hover:text-accent-600 flex-shrink-0"
      >
        Edit
      </button>
    );
  }

  return (
    <div className="absolute inset-0 z-10 bg-white border border-accent-200 rounded-2xl p-5 shadow-md">
      <form action={action} className="space-y-3">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="slug" value={slug} />

        <div className="grid sm:grid-cols-[10rem_1fr] gap-3">
          <div>
            <label className="block text-xs uppercase tracking-wider text-muted font-semibold mb-1">Date</label>
            <input
              type="date"
              name="date"
              required
              defaultValue={defaultDate}
              className="w-full rounded-lg border border-[var(--color-line)] focus:border-accent-600 focus:ring-2 focus:ring-accent-100 outline-none px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-muted font-semibold mb-1">Title</label>
            <input
              type="text"
              name="title"
              required
              defaultValue={defaultTitle}
              placeholder="Fund Raising Approved"
              className="w-full rounded-lg border border-[var(--color-line)] focus:border-accent-600 focus:ring-2 focus:ring-accent-100 outline-none px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs uppercase tracking-wider text-muted font-semibold mb-1">Description</label>
          <textarea
            name="body"
            required
            rows={5}
            defaultValue={body}
            className="w-full rounded-lg border border-[var(--color-line)] focus:border-accent-600 focus:ring-2 focus:ring-accent-100 outline-none px-3 py-2 text-sm leading-relaxed"
          />
          <p className="text-xs text-muted mt-1">
            Paragraphs are separated by a blank line. Inline links via <code className="font-mono">[label](https://url)</code>.
            {caption.match(/\(MCID-[A-Z0-9-]+\)/) && <> The original MCID tag is preserved automatically.</>}
          </p>
        </div>

        {state?.error && (
          <p className="text-sm text-accent-700 bg-accent-50 border border-accent-200 rounded-lg px-3 py-2">{state.error}</p>
        )}

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-xs font-semibold text-muted hover:text-ink"
          >
            Cancel
          </button>
          <SaveButton />
        </div>
      </form>
    </div>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="inline-flex items-center gap-2 rounded-full bg-accent-600 hover:bg-accent-700 disabled:bg-accent-600/70 disabled:cursor-wait text-white text-sm font-semibold px-4 py-2 transition"
    >
      {pending && (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="animate-spin" aria-hidden="true">
          <path d="M21 12a9 9 0 1 1-6.2-8.55" />
        </svg>
      )}
      {pending ? "Saving…" : "Save changes"}
    </button>
  );
}
