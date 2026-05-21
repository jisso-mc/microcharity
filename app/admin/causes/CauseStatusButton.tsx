"use client";

import { useFormStatus } from "react-dom";
import { setCauseStatusAction } from "./actions";

// Wraps the publish / close / re-open form so the button (a) shows clearly as a
// clickable link via the underline, (b) disables itself + shows a spinner while
// the server action is in flight. Without this, the row's stale "Publish" button
// stayed clickable during the ~1-2s re-render after submit — and once the row
// flipped to "Published" mid-click, the second tap landed on the now-rendered
// "Close" button and closed the cause by accident.

type Variant = "publish" | "close" | "reopen";

const VARIANT_CONFIG: Record<Variant, {
  nextStatus: "PUBLISHED" | "CLOSED";
  label: string;
  pendingLabel: string;
  className: string;
}> = {
  publish: { nextStatus: "PUBLISHED", label: "Publish",  pendingLabel: "Publishing…",  className: "text-accent-600 hover:text-accent-700" },
  close:   { nextStatus: "CLOSED",    label: "Close",    pendingLabel: "Closing…",     className: "text-accent-600 hover:text-accent-700" },
  reopen:  { nextStatus: "PUBLISHED", label: "Re-open",  pendingLabel: "Re-opening…",  className: "text-muted hover:text-ink" },
};

export default function CauseStatusButton({ causeId, variant }: { causeId: string; variant: Variant }) {
  const cfg = VARIANT_CONFIG[variant];
  return (
    <form action={setCauseStatusAction} className="inline">
      <input type="hidden" name="id" value={causeId} />
      <input type="hidden" name="status" value={cfg.nextStatus} />
      <Inner label={cfg.label} pendingLabel={cfg.pendingLabel} className={cfg.className} />
    </form>
  );
}

function Inner({ label, pendingLabel, className }: { label: string; pendingLabel: string; className: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`inline-flex items-center gap-1.5 text-xs font-semibold underline underline-offset-4 decoration-2 decoration-current/40 hover:decoration-current disabled:opacity-60 disabled:cursor-wait ${className}`}
    >
      {pending && <Spinner />}
      {pending ? pendingLabel : label}
    </button>
  );
}

function Spinner() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      className="animate-spin"
      aria-hidden="true"
    >
      <path d="M21 12a9 9 0 1 1-6.2-8.55" />
    </svg>
  );
}
