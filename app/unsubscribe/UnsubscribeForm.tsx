"use client";

import { useState } from "react";
import Link from "next/link";

export default function UnsubscribeForm({ email, token }: { email: string; token: string }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("email", email);
      fd.set("token", token);
      const res = await fetch("/api/unsubscribe", { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Could not unsubscribe.");
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not unsubscribe.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-ink">You&apos;ve been unsubscribed. <strong>{email}</strong> won&apos;t receive any more emails from MicroCharity.</p>
        <p className="text-xs text-muted">Changed your mind? Reply to info@microcharity.com to resubscribe.</p>
        <p className="pt-2"><Link href="/" className="text-sm text-muted hover:text-ink">← Back to MicroCharity</Link></p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <p className="text-sm text-ink">
        Confirm unsubscribing <strong>{email}</strong>? You won&apos;t receive any more emails from MicroCharity after this.
      </p>
      {error && <p className="text-sm text-accent-700 bg-accent-50 border border-accent-200 rounded-lg px-3 py-2">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-accent-600 hover:bg-accent-700 disabled:opacity-60 text-white font-semibold px-6 py-3 transition"
      >
        {busy ? "Unsubscribing…" : "Confirm unsubscribe"}
      </button>
      <p className="text-center text-xs text-muted">
        Changed your mind? <Link href="/" className="text-accent-600 hover:text-accent-700">Go back to MicroCharity</Link>
      </p>
    </form>
  );
}
