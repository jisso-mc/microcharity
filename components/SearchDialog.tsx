"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { inrShort } from "@/lib/format";

type Result = {
  slug: string;
  title: string;
  summary: string;
  image: string;
  status: "active" | "closed";
  raised: number;
  goal: number;
};

export default function SearchDialog() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [busy, setBusy] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Open dialog handler — exposed via DOM event so a normal <button> in the Header can trigger it
  useEffect(() => {
    const onOpen = () => setOpen(true);
    document.addEventListener("mc:search-open", onOpen);
    return () => document.removeEventListener("mc:search-open", onOpen);
  }, []);

  // Esc key closes
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    // Lock body scroll while open
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Auto-focus when opened
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length < 2) {
      setResults([]);
      setHasSearched(false);
      return;
    }
    setBusy(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`);
        const data = await res.json();
        setResults(data.results ?? []);
        setHasSearched(true);
      } catch {
        setResults([]);
        setHasSearched(true);
      } finally {
        setBusy(false);
      }
    }, 200);
  }, [q]);

  function close() {
    setOpen(false);
    setQ("");
    setResults([]);
    setHasSearched(false);
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Search causes"
      className="fixed inset-0 z-[100] flex items-start md:items-center justify-center px-4 py-12 md:py-20 bg-black/55 backdrop-blur-sm"
      onClick={close}
    >
      <div
        className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--color-line)]">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted flex-shrink-0">
            <circle cx="11" cy="11" r="8"/>
            <path d="m21 21-4.3-4.3"/>
          </svg>
          <input
            ref={inputRef}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search causes — by name, condition, place…"
            className="flex-1 outline-none text-base bg-transparent placeholder:text-muted"
            autoComplete="off"
          />
          <button
            onClick={close}
            aria-label="Close search"
            className="flex-shrink-0 w-8 h-8 rounded-full hover:bg-[var(--color-soft)] flex items-center justify-center text-muted hover:text-ink transition"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Results */}
        <div className="overflow-y-auto flex-1">
          {q.trim().length < 2 ? (
            <div className="px-5 py-10 text-center text-sm text-muted">
              Type at least 2 characters to search.
            </div>
          ) : busy && results.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-muted">Searching…</div>
          ) : hasSearched && results.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-muted">
              No causes match &ldquo;{q}&rdquo;.
            </div>
          ) : (
            <ul>
              {results.map((r) => (
                <li key={r.slug} className="border-b border-[var(--color-line)] last:border-0">
                  <Link
                    href={`/donations/${r.slug}`}
                    onClick={close}
                    className="flex gap-4 items-start px-5 py-4 hover:bg-[var(--color-soft)] transition"
                  >
                    <div className="w-16 h-16 rounded-lg overflow-hidden bg-[var(--color-soft)] border border-[var(--color-line)] flex-shrink-0">
                      {r.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.image} alt="" className="w-full h-full object-cover" loading="lazy" />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-2">
                        <h3 className="font-display text-base text-ink leading-snug flex-1">{r.title}</h3>
                        <span className={`text-[10px] uppercase tracking-wider font-semibold flex-shrink-0 mt-1 ${r.status === "active" ? "text-accent-600" : "text-muted"}`}>
                          {r.status}
                        </span>
                      </div>
                      {r.summary && (
                        <p className="text-xs text-muted line-clamp-2 mt-1">{r.summary}</p>
                      )}
                      <p className="text-xs text-muted mt-1">
                        <span className="font-semibold text-ink">{inrShort(r.raised)}</span>
                        <span> raised of {inrShort(r.goal)}</span>
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[var(--color-line)] bg-[var(--color-soft)] text-[11px] text-muted flex items-center justify-between">
          <span>{results.length > 0 ? `${results.length} result${results.length === 1 ? "" : "s"}` : ""}</span>
          <span>Press <kbd className="font-mono font-semibold text-ink">Esc</kbd> to close</span>
        </div>
      </div>
    </div>
  );
}
