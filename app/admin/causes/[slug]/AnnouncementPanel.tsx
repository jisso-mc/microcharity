"use client";

import { useEffect, useRef, useState } from "react";

type AnnouncementProgress = {
  id: string;
  status: "PENDING" | "SENDING" | "COMPLETED" | "CANCELLED";
  totalRecipients: number;
  successCount: number;
  failureCount: number;
  pendingCount: number;
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

// How often to (a) drive the next send batch and (b) refresh the live status.
// The batch driver reschedules itself after each batch finishes, so this is the
// gap *between* batches, not a hard interval. Status polling is independent so the
// numbers keep ticking up even while a long batch is mid-flight.
const DRIVE_GAP_MS = 3_000;
const STATUS_POLL_MS = 5_000;

export default function AnnouncementPanel(props: Props) {
  const inFlight = props.history.find((h) => h.status === "PENDING" || h.status === "SENDING") ?? null;
  const [active, setActive] = useState<AnnouncementProgress | null>(inFlight);
  const [history, setHistory] = useState<AnnouncementProgress[]>(props.history);
  const [starting, setStarting] = useState<"test" | "real" | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Soft, non-fatal status note (e.g. "retrying…"). Distinct from `error`, which is
  // reserved for hard failures that stop an action (bad input, failed to start).
  const [note, setNote] = useState<string | null>(null);
  const [testEmails, setTestEmails] = useState(props.currentUserEmail);

  // Keeps the latest active id available to the sender loop without re-subscribing.
  const activeIdRef = useRef<string | null>(active?.id ?? null);
  activeIdRef.current = active?.id ?? null;

  // ---- Sender loop + live status poller ----
  // This is the heart of the fix. The old version did `await res.json()` with no
  // guard, so any non-JSON response (a gateway timeout page, an empty 500) threw
  // and permanently killed the poller — freezing the send. Here every fetch is
  // defended: JSON parsing can't throw, non-OK responses become a soft "retrying"
  // note, and the loop keeps going. Sending resumes automatically whenever this
  // page is open (reopen the cause page after closing it to pick up where it left
  // off — already-sent donors are never re-emailed).
  useEffect(() => {
    if (!active) return;
    if (active.status === "COMPLETED" || active.status === "CANCELLED") return;

    const id = active.id;
    let disposed = false;
    let driveTimer: ReturnType<typeof setTimeout> | undefined;
    let statusTimer: ReturnType<typeof setInterval> | undefined;

    function finish() {
      disposed = true;
      if (driveTimer) clearTimeout(driveTimer);
      if (statusTimer) clearInterval(statusTimer);
    }

    function apply(p: AnnouncementProgress) {
      if (disposed) return;
      setActive(p);
      setHistory((h) => h.map((row) => (row.id === p.id ? p : row)));
      if (p.status === "COMPLETED" || p.status === "CANCELLED") finish();
    }

    // Read-only status refresh — cheap, frequent, never drives a send.
    async function pollStatus() {
      if (disposed) return;
      try {
        const res = await fetch(`/api/cause-announcements/${id}/process`, { method: "GET" });
        const j = await res.json().catch(() => null);
        if (j?.announcement) apply(j.announcement);
      } catch {
        /* transient — the next tick will retry */
      }
    }

    // Drive the next batch, then reschedule itself. Fully defended: no code path
    // here can throw out of the loop.
    async function drive() {
      if (disposed) return;
      let terminal = false;
      try {
        const res = await fetch(`/api/cause-announcements/${id}/process`, { method: "POST" });
        const j = await res.json().catch(() => null); // never throws on non-JSON
        if (j?.announcement) {
          apply(j.announcement);
          setNote(null);
          terminal = j.announcement.status === "COMPLETED" || j.announcement.status === "CANCELLED";
        } else {
          // Non-JSON or error body — surface softly and keep going.
          setNote("A send batch hit a snag — retrying automatically…");
        }
      } catch {
        setNote("Network hiccup — retrying automatically…");
      }
      if (disposed || terminal) return;
      driveTimer = setTimeout(drive, DRIVE_GAP_MS);
    }

    void pollStatus();
    void drive();
    statusTimer = setInterval(pollStatus, STATUS_POLL_MS);

    return () => { finish(); };
    // Re-subscribe only when the active announcement changes (new send started, or
    // resumed a different one). Status changes are applied via setActive without
    // tearing down the loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id]);

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
    setNote(null);
    try {
      const fd = new FormData();
      fd.set("causeId", props.causeId);
      if (mode === "test") {
        fd.set("test", "1");
        fd.set("testEmails", emails.join(", "));
      }
      const res = await fetch("/api/cause-announcements", { method: "POST", body: fd });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.announcement) throw new Error(j?.error ?? "Failed to start.");
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
          Sent in small batches with automatic retries. <strong>Keep this page open</strong> while
          it sends — if you close it, just reopen this cause page and it resumes where it left off
          (donors already emailed are never emailed twice).
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
                Sent in small batches with automatic retries. <strong>Not reversible.</strong>
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
      {note && active && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{note}</p>
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
  const remaining = row.pendingCount ?? Math.max(0, row.totalRecipients - done);
  const statusText =
    row.status === "PENDING" ? "Starting…"
    : row.status === "SENDING"
        ? `Sending… ${row.successCount} sent${row.failureCount > 0 ? ` · ${row.failureCount} failed` : ""} · ${remaining} to go (of ${row.totalRecipients})`
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
