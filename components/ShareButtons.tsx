"use client";

import { useEffect, useState } from "react";

interface Props {
  /** Path or absolute URL of the cause page (an absolute URL is built if relative) */
  path: string;
  title: string;
  text?: string;
}

export default function ShareButtons({ path, title, text }: Props) {
  const [url, setUrl] = useState(path);
  const [copied, setCopied] = useState(false);
  const [canNative, setCanNative] = useState(false);

  useEffect(() => {
    // Build the absolute URL only on the client so we get the live origin
    if (typeof window !== "undefined") {
      setUrl(new URL(path, window.location.origin).toString());
      setCanNative(typeof navigator !== "undefined" && typeof navigator.share === "function");
    }
  }, [path]);

  const fullText = text ? `${title} — ${text}` : title;
  const eu = encodeURIComponent(url);
  const et = encodeURIComponent(fullText);

  const whatsapp = `https://wa.me/?text=${et}%20${eu}`;
  const facebook = `https://www.facebook.com/sharer/sharer.php?u=${eu}`;
  const twitter  = `https://twitter.com/intent/tweet?text=${et}&url=${eu}`;
  const linkedin = `https://www.linkedin.com/sharing/share-offsite/?url=${eu}`;
  const email    = `mailto:?subject=${encodeURIComponent(title)}&body=${et}%20${eu}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard refused */
    }
  }

  async function nativeShare() {
    try {
      await navigator.share({ title, text, url });
    } catch {
      /* user cancelled or unsupported */
    }
  }

  const linkCls =
    "inline-flex items-center justify-center gap-1.5 rounded-full border border-[var(--color-line)] hover:border-accent-600 hover:text-accent-600 px-3 py-2 text-xs font-semibold transition";

  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-muted font-semibold mb-3">Share this cause</p>
      <div className="flex flex-wrap gap-2">
        <a href={whatsapp} target="_blank" rel="noopener noreferrer" aria-label="Share on WhatsApp" className={linkCls}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M.057 24l1.687-6.163a11.867 11.867 0 0 1-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 0 1 8.413 3.488 11.824 11.824 0 0 1 3.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 0 1-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 0 0 1.692 5.522l-.999 3.648 3.796-.869zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.711.306 1.265.489 1.697.626.713.226 1.362.194 1.875.118.572-.085 1.758-.719 2.006-1.413.247-.694.247-1.289.173-1.413z"/></svg>
          WhatsApp
        </a>
        <a href={facebook} target="_blank" rel="noopener noreferrer" aria-label="Share on Facebook" className={linkCls}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z"/></svg>
          Facebook
        </a>
        <a href={twitter} target="_blank" rel="noopener noreferrer" aria-label="Share on X (Twitter)" className={linkCls}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
          X
        </a>
        <a href={linkedin} target="_blank" rel="noopener noreferrer" aria-label="Share on LinkedIn" className={linkCls}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.063 2.063 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
          LinkedIn
        </a>
        <a href={email} aria-label="Share by email" className={linkCls}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
          Email
        </a>
        <button onClick={copy} aria-label="Copy link" className={linkCls}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          {copied ? "Copied!" : "Copy link"}
        </button>
        {canNative && (
          <button onClick={nativeShare} aria-label="Share via more apps (Instagram, etc.)" className={linkCls}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
            More apps
          </button>
        )}
      </div>
      <p className="text-[11px] text-muted mt-3">
        Sharing on WhatsApp / Facebook / X automatically pulls the cause photo and description from the page.
      </p>
    </div>
  );
}
