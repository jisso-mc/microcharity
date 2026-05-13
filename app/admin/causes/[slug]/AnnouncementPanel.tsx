"use client";

import { useEffect, useState } from "react";

type AnnouncementProgress = {
  id: string;
  status: "PENDING" | "SENDING" | "COMPLETED" | "CANCELLED";
  totalRecipients: number;
  successCount: number;
  failureCount: number;
  isTest: boolean;
  startedAt: string;
  completedAt: string | null;
  subject: string;
};

type Props = {
  causeId: string;
  causeSlug: string;
  causeTitle: string;
  optedInDonorCount: number;
  // Fixed list of admin reviewers who receive test sends (lib/trust.ts).
  testRecipientEmails: string[];
  history: AnnouncementProgress[];
};

const POLL_INTERVAL_MS = 60_000;

export default function AnnouncementPanel(props: Props) {
  const inFlight = props.history.find((h) => h.status === "PENDING" || h.status === "SENDING") ?? null;
  const [active, setActive] = useState<AnnouncementProgress | null>(inFlight);
  const [history, setHistory] = useState<AnnouncementProgress[]>(props.history);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Defaults to TRUE — sending the real broadcast must be an explicit opt-in
  // every time. Anyone who clicks Send without thinking gets the test send.
  const [testMode, setTestMode] = useState(true);

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
    void tick();
    const t = setInterval(tick, POLL_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(t); };
  }, [active]);

  async function onStart() {
    const testList = props.testRecipientEmails.join(", ");
    const msg = testMode
      ? `Send a TEST email of "${props.causeTitle}" to the admin reviewer list:\n\n${testList}\n\nNothing goes out to the donor list.`
      : `Send the real launch announcement for "${props.causeTitle}" to ALL ${props.optedInDonorCount} opted-in donors?\n\nThis can't be undone. Donors who unsubscribe later will still get this email.`;
    if (!confirm(msg)) return;
    setStarting(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("causeId", props.causeId);
      if (testMode) fd.set("test", "1");
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
      <div>
        <h2 className="font-display text-xl text-ink">Launch announcement</h2>
        <p className="text-sm text-muted mt-1">
          Email all {props.optedInDonorCount} opted-in donors that this cause is live.
          Sent in batches of 50 every minute; safe to close this page and come back later.
        </p>
      </div>

      {!active && (
        <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-soft)] p-4 space-y-3">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={testMode}
              onChange={(e) => setTestMode(e.target.checked)}
              className="mt-1 accent-accent-600"
            />
            <span className="text-sm text-ink leading-relaxed">
              <strong>Send test to the admin reviewer list</strong>
              <span className="block text-xs text-muted mt-0.5">
                Sends to {props.testRecipientEmails.length} reviewers ({props.testRecipientEmails.join(", ")}).
                Recommended for the first send. Uncheck when the template looks right
                and you&apos;re ready to fire to all {props.optedInDonorCount} donors.
              </span>
            </span>
          </label>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted">
              {testMode
                ? <>Will send <strong className="text-ink">{props.testRecipientEmails.length} emails</strong> to the reviewer list.</>
                : <>Will send <strong className="text-accent-700">{props.optedInDonorCount} emails</strong> to every opted-in donor. <strong>Not reversible.</strong></>
              }
            </p>
            <button
              type="button"
              onClick={onStart}
              disabled={starting || (!testMode && props.optedInDonorCount === 0)}
              className={`rounded-full text-white text-sm font-semibold px-4 py-2 transition disabled:opacity-60 ${
                testMode ? "bg-ink hover:bg-ink/80" : "bg-accent-600 hover:bg-accent-700"
              }`}
            >
              {starting ? "Starting…" : testMode ? "Send test to reviewers" : "Send to all donors"}
            </button>
          </div>
        </div>
      )}

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
        <div className="flex items-center gap-2 min-w-0">
          {row.isTest && (
            <span className="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-700 whitespace-nowrap">
              Test
            </span>
          )}
          <p className="text-sm font-semibold text-ink truncate" title={row.subject}>{row.subject}</p>
        </div>
        <span className="text-xs text-muted whitespace-nowrap">{new Date(row.startedAt).toLocaleString("en-IN")}</span>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-[var(--color-line)] overflow-hidden">
        <div className="h-full bg-accent-600 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-muted mt-1.5">{statusText}</p>
    </div>
  );
}
