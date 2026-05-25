"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import CauseStatusButton from "./CauseStatusButton";

// 3-dot action menu for each cause row in /admin/causes. Replaces the flat
// "Close · Duplicate · View" link cluster — same actions, just hidden behind
// a button so the table stays tidier and there's room to add more items
// without crowding.
//
// Open / close behaviour:
//   * Click the dots to toggle.
//   * Click anywhere outside the popover to close.
//   * Press Escape to close.
//   * Picking any item also closes the menu (the link or form takes the user
//     somewhere else, but we close optimistically anyway so the popover
//     doesn't linger if the action is a no-op redirect to the same page).

type Variant = "publish" | "close" | "reopen";

export default function CauseRowMenu({
  causeId,
  slug,
  statusVariant,
}: {
  causeId: string;
  slug: string;
  // Same value the existing CauseStatusButton accepts; null when the cause's
  // status has no flippable action (shouldn't happen today but kept for
  // safety as schema evolves).
  statusVariant: Variant | null;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Cause actions"
        className="inline-flex items-center justify-center w-8 h-8 rounded-full text-muted hover:bg-[var(--color-soft)] hover:text-ink transition"
      >
        {/* Vertical three-dot glyph. SVG so it scales cleanly + stays
            consistent across OS font stacks (the unicode ⋮ renders
            inconsistently in some browsers). */}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="12" cy="5"  r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="12" cy="19" r="2" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 w-44 origin-top-right rounded-xl border border-[var(--color-line)] bg-white shadow-lg ring-1 ring-black/5 py-1 text-sm"
        >
          {/* Close / Re-open / Publish — wraps the existing status button
              inside a menu row so its label and in-flight spinner still
              come along for free. The button's own onClick won't close
              the menu (it submits a form action); rely on the navigation
              that follows, plus we toggle open=false on mousedown of any
              child via the bubbling document listener. */}
          {statusVariant && (
            <div role="menuitem" className="px-3 py-2 hover:bg-[var(--color-soft)]" onClick={() => setOpen(false)}>
              <CauseStatusButton causeId={causeId} variant={statusVariant} />
            </div>
          )}
          <MenuLink
            href={`/admin/causes/new?from=${encodeURIComponent(slug)}`}
            label="Duplicate"
            onClick={() => setOpen(false)}
            description="Continue this campaign as a new round."
          />
          <MenuLink
            href={`/admin/causes/${slug}`}
            label="Edit page"
            onClick={() => setOpen(false)}
            description="Manage timeline, status, announcements."
          />
          <MenuLink
            href={`/donations/${slug}`}
            label="View public page"
            target="_blank"
            onClick={() => setOpen(false)}
            description="Opens the donor-facing page in a new tab."
          />
        </div>
      )}
    </div>
  );
}

function MenuLink({
  href,
  label,
  target,
  description,
  onClick,
}: {
  href: string;
  label: string;
  target?: string;
  description?: string;
  onClick: () => void;
}) {
  return (
    <Link
      href={href}
      target={target}
      onClick={onClick}
      role="menuitem"
      className="block px-3 py-2 hover:bg-[var(--color-soft)] text-ink"
      title={description}
    >
      {label}
    </Link>
  );
}
