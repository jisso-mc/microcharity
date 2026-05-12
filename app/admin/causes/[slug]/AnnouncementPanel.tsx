"use client";

import { useEffect, useState } from "react";

// Shape of the row returned by /api/cause-announcements/[id]/progress. Kept inline
// to avoid coupling to the Prisma type (which would force this client component to
// import server-only modules).
type AnnouncementProgress = {
  id: string;
  status: "PENDING" | "SENDING" | "COMPLETED" | "CANCELLED";
  totalRecipients: number;
  successCount: number;
  failureCount: number;
  startedAt: string;
  completedAt: string | null;
  subject: string;
};

type Props = {
  causeId: string;
  causeSlug: string;
  causeTitle: string;
  optedInDonorCount: number;
  // Past announcements for this cause (most recent first). The first one with status
  // SENDING or PENDING (if any) drives the polling UI; everything else is history.
  history: AnnouncementProgress[];
};

const POLL_INTERVAL_MS = 60_000; // matches the user's 50/min throttle target

export default function AnnouncementPanel(props: Props) {
  const inFlight = props.history.find((h) => h.status === "PENDING" || h.status === "SENDING") ?? null;
  const [active, setActive] = useState<AnnouncementProgress | null>(inFlight);
  const [history, setHistory] = useState<AnnouncementProgress[]>(props.history);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Poll while an announcement is in-flight. Each poll triggers the server to send
  // the next batch (BATCH_SIZE recipients) and returns the updated counters.
  useEffect(() => {
    if (!active || active.status === "COMPLETED" || active.status === "CANCELLED") return;

    let cancelled = false;
    async function tick() {
      if (cancelled || !active) return;
      try {
        const res = await fetch(`/api/cause-announcements/${active.id}/process`, { method: "POST" });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error ?? "Batch failed.");
        const updated: AnnouncementProgress = j.announcement;
        setActive(updated);
        setHistory((h) => h.map((row) => (row.id === updated.id ? updated : row)));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to send next batch.");
      }
    }
    // Fire the first batch immediately (don't wait a full minute for the very first one).
    void tick();
    const t = setInterval(tick, POLL_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(t); };
  }, [active]);

  async function onStart() {
    if (!confirm(`Send the launch announcement for "${props.causeTitle}" to ${props.optedInDonorCount} opted-in donors?\n\nThis can't be undone. Donors who unsubscribe later will still get this email.`)) return;
    setStarting(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("causeId", props.causeId);
      const res = await fetch("/api/cause-announcements", { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Failed to start.");
      const fresh: AnnouncementProgress = j.announcement;
      setActive(fresh);
      setHistory((h) => [fresh, ...h]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start.");
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-xl text-ink">Launch announcement</h2>
          <p className="text-sm text-muted mt-1">
            Email all {props.optedInDonorCount} opted-in donors that this cause is live.
            Sent in batches of 50 every minute; safe to close this page and come back later.
          </p>
        </div>
        {!active && (
          <button
            type="button"
            onClick={onStart}
            disabled={starting || props.optedInDonorCount === 0}
            className="rounded-full bg-accent-600 hover:bg-accent-700 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 transition"
          >
            {starting ? "Starting…" : "Send launch announcement"}
          </button>
        )}
      </div>

      {error && (
        <p className="text-sm text-accent-700 bg-accent-50 border border-accent-200 rounded-lg px-3 py-2">{error}</p>
      )}

      {active && (
        <ProgressRow row={active} highlight={true} />
      )}

      {history.filter((h) => h.id !== active?.id).length > 0 && (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wider text-muted font-semibold">History</p>
          {history.filter((h) => h.id !== active?.id).map((row) => (
            <ProgressRow key={row.id} row={row} highlight={false} />
          ))}
        </div>
      )}

    </div>
  );
}

function ProgressRow({ row, highlight }: { row: AnnouncementProgress; highlight: boolean }) {
  const done = row.successCount + row.failureCount;
  const pct = row.totalRecipients > 0 ? Math.round((done / row.totalRecipients) * 100) : 0;
  const statusText =
    row.status === "PENDING" ? "Starting…"
    : row.status === "SENDING" ? `Sending… ${done} / ${row.totalRecipients}`
    : row.status === "COMPLETED" ? `Completed · ${row.successCount} delivered${row.failureCount > 0 ? ` · ${row.failureCount} failed` : ""}`
    : "Cancelled";
  return (
    <div className={`rounded-lg border p-3 ${highlight ? "border-accent-600 bg-accent-50/30" : "border-[var(--color-line)] bg-white"}`}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-semibold text-ink truncate" title={row.subject}>{row.subject}</p>
        <span className="text-xs text-muted whitespace-nowrap">{new Date(row.startedAt).toLocaleString("en-IN")}</span>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-[var(--color-line)] overflow-hidden">
        <div className="h-full bg-accent-600 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-muted mt-1.5">{statusText}</p>
    </div>
  );
}
