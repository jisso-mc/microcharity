"use client";

import { useEffect, useState } from "react";

type AnnouncementProgress = {
  id: string;
  status: "PENDING" | "SENDING" | "COMPLETED" | "CANCELLED";
  totalRecipients: number;
  successCount: number;
  failureCount: number;
  openCount: number;
  clickCount: number;
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
  // Prefill value for the test-emails textbox — the logged-in admin's email.
  // They can edit / add more comma-separated addresses before sending.
  currentUserEmail: string;
  history: AnnouncementProgress[];
};

const POLL_INTERVAL_MS = 60_000;

export default function AnnouncementPanel(props: Props) {
  const inFlight = props.history.find((h) => h.status === "PENDING" || h.status === "SENDING") ?? null;
  const [active, setActive] = useState<AnnouncementProgress | null>(inFlight);
  const [history, setHistory] = useState<AnnouncementProgress[]>(props.history);
  const [starting, setStarting] = useState<"test" | "real" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testEmails, setTestEmails] = useState(props.currentUserEmail);

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

  function parseTestEmails(raw: string): string[] {
    return Array.from(
      new Set(
        raw.split(/[,\s;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean)
      )
    );
  }

  async function startSend(mode: "test" | "real") {
    const emails = parseTestEmails(testEmails);

    if (mode === "test") {
      if (emails.length === 0) {
        setError("Add at least one email to test with.");
        return;
      }
      const bad = emails.filter((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
      if (bad.length) {
        setError(`Invalid email(s): ${bad.join(", ")}`);
        return;
      }
      if (!confirm(`Send a TEST email of "${props.causeTitle}" to:\n\n${emails.join(", ")}\n\nNothing goes out to the donor list.`)) {
        return;
      }
    } else {
      if (props.optedInDonorCount === 0) return;
      if (!confirm(`Send the real launch announcement for "${props.causeTitle}" to ALL ${props.optedInDonorCount} opted-in donors?\n\nThis can't be undone. Donors who unsubscribe later will still get this email.`)) {
        return;
      }
    }

    setStarting(mode);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("causeId", props.causeId);
      if (mode === "test") {
        fd.set("test", "1");
        fd.set("testEmails", emails.join(", "));
      }
      const res = await fetch("/api/cause-announcements", { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Failed to start.");
      const fresh: AnnouncementProgress = j.announcement;
      setActive(fresh);
      setHistory((h) => [fresh, ...h]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start.");
    } finally {
      setStarting(null);
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
        <div className="space-y-4">
          {/* Test send — admin-defined recipient list. Defaults to the
              current admin's email so the simplest "send myself a preview"
              flow is one click. */}
          <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-soft)] p-4 space-y-3">
            <div>
              <p className="text-sm font-semibold text-ink">Test announcement</p>
              <p className="text-xs text-muted mt-0.5">
                Send a preview to one or more email addresses. Comma-separated. Donors are not affected.
              </p>
            </div>
            <textarea
              value={testEmails}
              onChange={(e) => setTestEmails(e.target.value)}
              rows={2}
              placeholder="you@example.com, teammate@example.com"
              className="w-full rounded-lg border border-[var(--color-line)] bg-white focus:border-accent-600 focus:ring-2 focus:ring-accent-100 outline-none px-3 py-2 text-sm font-mono"
            />
            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={() => startSend("test")}
                disabled={starting !== null}
                className="rounded-full bg-ink text-white text-sm font-semibold px-4 py-2 hover:bg-ink/80 transition disabled:opacity-60"
              >
                {starting === "test" ? "Sending…" : "Send test"}
              </button>
            </div>
          </div>

          {/* Real send — full donor broadcast. Visually separated and the
              button is the accent colour so it can't be confused with the
              test action above. */}
          <div className="rounded-lg border border-accent-200 bg-accent-50/30 p-4 space-y-3">
            <div>
              <p className="text-sm font-semibold text-ink">Send announcement to all donors</p>
              <p className="text-xs text-muted mt-0.5">
                Will email <strong className="text-accent-700">{props.optedInDonorCount}</strong> opted-in donors.
                Sent in batches of 50 every minute. <strong>Not reversible.</strong>
              </p>
            </div>
            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={() => startSend("real")}
                disabled={starting !== null || props.optedInDonorCount === 0}
                className="rounded-full bg-accent-600 text-white text-sm font-semibold px-4 py-2 hover:bg-accent-700 transition disabled:opacity-60"
              >
                {starting === "real" ? "Sending…" : `Send to all ${props.optedInDonorCount} donors`}
              </button>
            </div>
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
  // Open / click rates are computed against the number we actually delivered,
  // not totalRecipients, so failed sends don't drag the percentage down.
  const delivered = row.successCount;
  const openPct = delivered > 0 ? Math.round((row.openCount / delivered) * 100) : 0;
  const clickPct = delivered > 0 ? Math.round((row.clickCount / delivered) * 100) : 0;
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
      {row.status === "COMPLETED" && delivered > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          <span><strong className="text-ink">{row.openCount}</strong> opened ({openPct}%)</span>
          <span><strong className="text-ink">{row.clickCount}</strong> clicked ({clickPct}%)</span>
        </div>
      )}
    </div>
  );
}
