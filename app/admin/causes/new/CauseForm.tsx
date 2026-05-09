"use client";

import { useActionState, useEffect, useState } from "react";
import { createCauseAction, type CauseFormState } from "../actions";

type Predecessor = {
  slug: string;
  title: string;
  beneficiaryKey: string;
  category: string;
  location: string;
  goal: number;
  image: string;
  updates: { caption: string; body: string; postedAt: string; sortOrder: number }[];
};

type SearchHit = {
  slug: string;
  title: string;
  status: "DRAFT" | "PUBLISHED" | "CLOSED";
  mcId: string | null;
  beneficiaryKey: string | null;
  updateCount: number;
  startDate: string | null;
  createdAt: string;
};

const inputCls =
  "w-full rounded-lg border border-[var(--color-line)] focus:border-accent-600 focus:ring-2 focus:ring-accent-100 outline-none px-3 py-2.5 text-sm";

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}
function slugCleanDuringTyping(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-{2,}/g, "-").slice(0, 80);
}
function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fmtDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" });
}

export default function CauseForm({ predecessor }: { predecessor?: Predecessor }) {
  const [state, formAction, pending] = useActionState<CauseFormState, FormData>(createCauseAction, {});

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);

  function onTitleChange(v: string) {
    setTitle(v);
    if (!slugTouched) setSlug(slugify(v));
  }

  return (
    <div className="space-y-8">
      {/* Predecessor picker — collapses once a predecessor is chosen */}
      <PredecessorSection predecessor={predecessor} />

      <form action={formAction} className="space-y-5">
        {/* Carry the predecessor slug through to the server action */}
        {predecessor && <input type="hidden" name="fromSlug" value={predecessor.slug} />}

        <h2 className="font-display text-xl text-ink">New entry details</h2>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-ink mb-2">Date *</label>
            <input type="date" name="date" defaultValue={todayISO()} required className={inputCls} />
            <p className="text-xs text-muted mt-1">Used as the date prefix on the new timeline entry.</p>
          </div>
          <div>
            <label className="block text-sm font-semibold text-ink mb-2">Place</label>
            <input
              type="text"
              name="location"
              defaultValue={predecessor?.location ?? ""}
              className={inputCls}
              placeholder="e.g. Pala, Kerala"
            />
            <p className="text-xs text-muted mt-1">Shown on the new timeline entry caption.</p>
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-ink mb-2">Title *</label>
          <input
            type="text"
            name="title"
            required
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            className={inputCls}
            placeholder="e.g. College Fee for Saniya — May 2026"
          />
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
              onChange={(e) => { setSlug(slugCleanDuringTyping(e.target.value)); setSlugTouched(true); }}
              className="flex-1 outline-none px-3 py-2.5 text-sm font-mono"
              placeholder="college-fee-saniya-may-2026"
            />
          </div>
          <p className="text-xs text-muted mt-1">Lowercase letters, numbers, and hyphens. Must be unique.</p>
        </div>

        <div>
          <label className="block text-sm font-semibold text-ink mb-2">Description *</label>
          <textarea
            name="story"
            rows={6}
            required
            className={`${inputCls} resize-y`}
            placeholder="The body of the new timeline entry. Shown below the predecessor's history on the cause page."
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-ink mb-2">Amount (goal, ₹) *</label>
          <input
            type="number"
            name="goal"
            min={0}
            step={500}
            defaultValue={predecessor?.goal || ""}
            required
            className={inputCls}
            placeholder="50000"
          />
        </div>

        {/* Hidden / less-frequently-changed fields kept as inputs so the action receives them */}
        <input type="hidden" name="beneficiaryKey" value={predecessor?.beneficiaryKey ?? ""} />
        <input type="hidden" name="category" value={predecessor?.category ?? ""} />
        <input type="hidden" name="image" value={predecessor?.image ?? ""} />
        <input type="hidden" name="summary" value="" />

        <div>
          <label className="block text-sm font-semibold text-ink mb-2">Save as</label>
          <select name="status" defaultValue="PUBLISHED" className={`${inputCls} bg-white`}>
            <option value="PUBLISHED">Published (live on the website)</option>
            <option value="DRAFT">Draft (not visible publicly)</option>
          </select>
        </div>

        <div className="rounded-lg bg-[var(--color-soft)] border border-[var(--color-line)] p-3 text-xs text-muted">
          <strong className="text-ink">MicroCharity ID</strong> auto-generates on save in the format
          <code className="font-mono text-ink"> MCID-N-{`{FY}`}</code> (sequence resets each financial year).
          It appears on this new entry&apos;s caption.
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
            {pending ? "Saving…" : "Create cause"}
          </button>
          <p className="text-xs text-muted">
            {predecessor
              ? `${predecessor.updates.length} prior entries will be copied + this new one appended.`
              : "Just this entry — no predecessor selected."}
          </p>
        </div>
      </form>
    </div>
  );
}

function PredecessorSection({ predecessor }: { predecessor?: Predecessor }) {
  if (predecessor) {
    return (
      <section className="rounded-lg border border-[var(--color-line)] bg-[var(--color-soft)] p-4 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-base text-ink">Continuing from</h2>
            <p className="text-sm text-ink mt-1">
              <code className="font-mono text-xs">{predecessor.slug}</code> — {predecessor.title}
            </p>
            <p className="text-xs text-muted mt-1">
              {predecessor.updates.length} timeline entries will be copied onto the new cause as read-only history.
            </p>
          </div>
          <a
            href="/admin/causes/new"
            className="text-xs font-semibold text-accent-700 hover:text-accent-600 whitespace-nowrap"
          >
            Change…
          </a>
        </div>
        <PredecessorHistory updates={predecessor.updates} />
      </section>
    );
  }
  return <PredecessorPicker />;
}

function PredecessorHistory({ updates }: { updates: Predecessor["updates"] }) {
  if (updates.length === 0) {
    return <p className="text-xs text-muted">No timeline entries on the predecessor.</p>;
  }
  return (
    <div className="rounded-lg border border-[var(--color-line)] bg-white p-4 max-h-72 overflow-y-auto">
      <p className="text-[11px] uppercase tracking-wider font-semibold text-muted mb-3">
        Read-only history (copies will be created)
      </p>
      <ol className="space-y-3">
        {updates.map((u, i) => (
          <li key={i} className="border-l-2 border-[var(--color-line)] pl-3">
            {u.caption && (
              <p className="text-xs font-semibold text-accent-600 uppercase tracking-wider mb-1">{u.caption}</p>
            )}
            <p className="text-xs text-ink/80 line-clamp-3 whitespace-pre-wrap">{u.body}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

function PredecessorPicker() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [skipSearch, setSkipSearch] = useState(false);

  // Debounce search; bail out for short queries.
  useEffect(() => {
    if (skipSearch) { setSkipSearch(false); return; }
    const trimmed = q.trim();
    if (trimmed.length < 2) { setHits([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/admin/causes/search?q=${encodeURIComponent(trimmed)}`);
        const j = await res.json();
        setHits(j.results ?? []);
      } catch {
        setHits([]);
      } finally {
        setSearching(false);
      }
    }, 220);
    return () => clearTimeout(t);
  }, [q, skipSearch]);

  return (
    <section className="rounded-lg border border-[var(--color-line)] bg-[var(--color-soft)] p-4 space-y-3">
      <div>
        <h2 className="font-display text-base text-ink">Continuing a previous campaign?</h2>
        <p className="text-xs text-muted mt-1">
          Search for a cause to copy its history onto the new one. Skip this section if this is a brand-new cause.
        </p>
      </div>
      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className={inputCls}
        placeholder="Search by title, slug, or beneficiary key…"
      />
      {searching && <p className="text-xs text-muted">Searching…</p>}
      {!searching && q.trim().length >= 2 && hits.length === 0 && (
        <p className="text-xs text-muted">No matches.</p>
      )}
      {hits.length > 0 && (
        <ul className="rounded-lg border border-[var(--color-line)] bg-white divide-y divide-[var(--color-line)] max-h-72 overflow-y-auto">
          {hits.map((h) => (
            <li key={h.slug}>
              <a
                href={`/admin/causes/new?from=${encodeURIComponent(h.slug)}`}
                className="block px-3 py-2 hover:bg-[var(--color-soft)] transition"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-semibold text-ink">{h.title}</span>
                  <span className={`text-[10px] uppercase tracking-wider font-semibold ${
                    h.status === "PUBLISHED" ? "text-accent-600" : h.status === "DRAFT" ? "text-amber-600" : "text-muted"
                  }`}>
                    {h.status.toLowerCase()}
                  </span>
                </div>
                <div className="text-xs text-muted mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                  <span className="font-mono">{h.slug}</span>
                  <span>{h.updateCount} entries</span>
                  {h.startDate && <span>started {fmtDate(h.startDate)}</span>}
                  {!h.startDate && <span>created {fmtDate(h.createdAt)}</span>}
                  {h.mcId && <span className="font-mono">{h.mcId}</span>}
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
