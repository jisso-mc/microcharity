"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type DonorOption = { id: string; name: string; email: string; phone: string | null; address: string | null };

const inputCls = "w-full rounded-lg border border-[var(--color-line)] focus:border-accent-600 focus:ring-2 focus:ring-accent-100 outline-none px-3 py-2.5 text-sm";

// Searchable donor combobox for the manual donation form. Filters the
// pre-loaded list by name / email / phone as you type; arrow keys + Enter
// select. Calls onSelect with the chosen donor (null when cleared).
export default function DonorPicker({
  donors,
  selected,
  loading,
  onSelect,
}: {
  donors: DonorOption[];
  selected: DonorOption | null;
  loading: boolean;
  onSelect: (d: DonorOption | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? donors.filter(d =>
          d.name.toLowerCase().includes(q) ||
          d.email.toLowerCase().includes(q) ||
          (d.phone ?? "").replace(/\s+/g, "").includes(q.replace(/\s+/g, "")))
      : donors;
    return list.slice(0, 50);
  }, [donors, query]);

  // Close on outside click.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // Keep the highlighted option scrolled into view.
  useEffect(() => {
    listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function choose(d: DonorOption) {
    onSelect(d);
    setQuery("");
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive(a => Math.min(a + 1, matches.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") {
      // Never submit the donation form from the search box.
      e.preventDefault();
      if (open && matches[active]) choose(matches[active]);
    }
    else if (e.key === "Escape") setOpen(false);
  }

  if (selected) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-line)] bg-[var(--color-soft)] px-3 py-2.5 text-sm">
        <span className="min-w-0">
          <span className="font-semibold text-ink">{selected.name}</span>
          <span className="text-muted"> · {selected.email}</span>
          {loading && <span className="text-muted"> · loading profile…</span>}
        </span>
        <button
          type="button"
          onClick={() => onSelect(null)}
          className="text-xs font-semibold text-accent-700 hover:text-accent-600 whitespace-nowrap"
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div ref={boxRef} className="relative">
      <input
        type="search"
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); setActive(0); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={`Search ${donors.length} donors by name, email or phone…`}
        role="combobox"
        aria-expanded={open}
        aria-controls="donor-picker-list"
        aria-autocomplete="list"
        className={inputCls}
      />
      {open && (
        <ul
          id="donor-picker-list"
          ref={listRef}
          role="listbox"
          className="absolute z-20 mt-1 w-full max-h-72 overflow-y-auto rounded-lg border border-[var(--color-line)] bg-white shadow-lg text-sm"
        >
          {matches.length === 0 ? (
            <li className="px-3 py-2 text-muted">No matching donor — fill in the details below to add a new one.</li>
          ) : matches.map((d, i) => (
            <li
              key={d.id}
              role="option"
              aria-selected={i === active}
              onMouseDown={e => { e.preventDefault(); choose(d); }}
              onMouseEnter={() => setActive(i)}
              className={`px-3 py-2 cursor-pointer ${i === active ? "bg-accent-50" : ""}`}
            >
              <span className="font-semibold text-ink">{d.name}</span>
              <span className="text-muted"> · {d.email}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
