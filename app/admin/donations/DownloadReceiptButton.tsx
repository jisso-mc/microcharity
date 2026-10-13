"use client";

import { useState } from "react";

// Downloads the 80G receipt PDF for an approved donation. The PDF is rebuilt
// server-side on each click (/api/admin/donations/[id]/receipt), which takes a
// second or two — so fetch it here and show a busy state rather than a bare
// link that looks dead while the server renders.
export default function DownloadReceiptButton({ donationId }: { donationId: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/donations/${donationId}/receipt`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Download failed");
      }
      const disposition = res.headers.get("content-disposition") ?? "";
      const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? "MicroCharity-Receipt.pdf";
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        aria-busy={pending}
        className="text-xs font-semibold text-accent-700 hover:text-accent-600 disabled:opacity-60 disabled:cursor-wait inline-flex items-center gap-1.5"
        title="Download the 80G receipt PDF"
      >
        {pending && <Spinner />}
        {pending ? "Preparing…" : "Download receipt"}
      </button>
      {error && <span className="text-xs text-accent-700">{error}</span>}
    </span>
  );
}

function Spinner() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      className="animate-spin"
      aria-hidden="true"
    >
      <path d="M21 12a9 9 0 1 1-6.2-8.55" />
    </svg>
  );
}
