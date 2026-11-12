"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

// Client pieces for /admin/forms/[id]: busy-state submit buttons, the applicant
// edit-link copier, delete confirmation, and the PDF backup panel.

export function Spinner({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="animate-spin" aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-6.2-8.55" />
    </svg>
  );
}

/** Submit button for a server-action <form>; shows a spinner + label while pending. */
export function PendingButton({
  children, pendingLabel, className, disabled, confirm,
}: {
  children: React.ReactNode;
  pendingLabel: string;
  className: string;
  disabled?: boolean;
  confirm?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      aria-busy={pending}
      onClick={(e) => { if (confirm && !window.confirm(confirm)) e.preventDefault(); }}
      className={`${className} inline-flex items-center gap-1.5 disabled:cursor-not-allowed`}
    >
      {pending && <Spinner />}
      {pending ? pendingLabel : children}
    </button>
  );
}

/** Shows the applicant's personal edit link with a one-click copy. */
export function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard API blocked (non-HTTPS / permissions) — fall back to a prompt.
      window.prompt("Copy this link:", url);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        readOnly
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        className="flex-1 min-w-[16rem] rounded-lg border border-[var(--color-line)] bg-[var(--color-soft)] px-3 py-2 text-xs font-mono text-ink"
      />
      <button
        type="button"
        onClick={copy}
        className="rounded-full bg-ink hover:bg-ink/85 text-white text-xs font-semibold px-4 py-2 transition"
      >
        {copied ? "Copied ✓" : "Copy link"}
      </button>
    </div>
  );
}

/** Download / email the backup PDF (only rendered once the application is approved). */
export function BackupPanel({ id, defaultEmail }: { id: string; defaultEmail: string }) {
  const [to, setTo] = useState(defaultEmail);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/forms/${id}/pdf`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ to }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "Could not send the email.");
      setMsg({ ok: true, text: `Sent to ${to} — “${j.subject}”.` });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Could not send the email." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <form onSubmit={send} className="flex flex-wrap items-center gap-2">
        <input
          type="email"
          required
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="backup@example.com"
          className="flex-1 min-w-[16rem] rounded-lg border border-[var(--color-line)] focus:border-accent-600 focus:ring-2 focus:ring-accent-100 outline-none px-3 py-2 text-sm bg-white"
        />
        <button
          type="submit"
          disabled={busy}
          aria-busy={busy}
          className="inline-flex items-center gap-1.5 rounded-full bg-accent-600 hover:bg-accent-700 disabled:opacity-60 disabled:cursor-wait text-white text-sm font-semibold px-5 py-2 transition"
        >
          {busy && <Spinner />}
          {busy ? "Generating & sending…" : "Email PDF"}
        </button>
        <a
          href={`/api/admin/forms/${id}/pdf`}
          className="rounded-full border border-[var(--color-line)] hover:border-ink text-ink text-sm font-semibold px-5 py-2 transition"
        >
          Download PDF
        </a>
      </form>
      {msg && (
        <p className={`text-sm rounded-lg px-3 py-2 border ${msg.ok ? "text-green-800 bg-green-50 border-green-200" : "text-accent-700 bg-accent-50 border-accent-200"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
