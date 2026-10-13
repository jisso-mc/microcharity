"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";

export default function LoginForm() {
  const params = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Defense in depth — even though the button's `disabled` attribute blocks
    // the click, a fast double-tap or Enter-twice still fires the form's
    // submit event. Bail out if a request is already in flight.
    if (busy) return;
    setError(null);
    setBusy(true);
    const data = Object.fromEntries(new FormData(e.currentTarget).entries());
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Login failed");
      // Defend against open-redirect via the ?from= parameter — accept only same-origin
      // paths (must start with "/", must not start with "//" or "/\\" which can be
      // re-parsed as protocol-relative URLs).
      const fromRaw = params.get("from");
      const next = fromRaw && fromRaw.startsWith("/") && !fromRaw.startsWith("//") && !fromRaw.startsWith("/\\")
        ? fromRaw
        : "/admin";
      // Hard navigation, not router.push() + router.refresh(): the refresh raced
      // the push and re-rendered /admin/login with the new session cookie, so
      // the admin nav appeared but the sign-in form stayed on screen. A full
      // load guarantees the destination renders fresh with the session.
      window.location.replace(next);
      // Deliberately leave `busy` = true on the success path. The navigation
      // takes a few hundred ms — flipping busy back to false here would
      // re-enable the button
      // while the user is still on the login page, and impatient retries
      // were firing duplicate login requests against the still-mounted form.
      // The form unmounts when navigation completes, taking the busy state
      // with it; no need to reset.
      return;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
      setBusy(false);
    }
  }

  const inputCls = "w-full rounded-lg border border-[var(--color-line)] focus:border-accent-600 focus:ring-2 focus:ring-accent-100 outline-none px-3 py-2.5 text-sm";

  const justInvited = params.get("invited") === "1";

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {justInvited && (
        <p className="text-sm text-green-800 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          Your password is set. Please sign in below.
        </p>
      )}
      <div>
        <label className="block text-sm font-semibold text-ink mb-2">Email</label>
        <input type="email" name="email" required autoFocus autoComplete="username" className={inputCls} />
      </div>
      <div>
        <label className="block text-sm font-semibold text-ink mb-2">Password</label>
        <input type="password" name="password" required autoComplete="current-password" className={inputCls} />
      </div>
      {error && (
        <p className="text-sm text-accent-700 bg-accent-50 border border-accent-200 rounded-lg px-3 py-2">{error}</p>
      )}
      <button
        type="submit"
        disabled={busy}
        aria-busy={busy}
        className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-accent-600 hover:bg-accent-700 disabled:bg-accent-600/70 disabled:cursor-wait text-white font-semibold px-6 py-3 transition"
      >
        {busy && (
          <svg
            width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="3" strokeLinecap="round"
            className="animate-spin"
            aria-hidden="true"
          >
            <path d="M21 12a9 9 0 1 1-6.2-8.55" />
          </svg>
        )}
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
