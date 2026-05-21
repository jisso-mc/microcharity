import Link from "next/link";
import { site } from "@/lib/data/site";

export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-24 bg-white border-t border-[var(--color-line)]">
      <div className="container-page py-14 grid grid-cols-1 md:grid-cols-4 gap-10">
        <div className="md:col-span-2">
          <Link href="/" className="inline-block mb-4" aria-label={`${site.name} home`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.jpg" alt={site.name} className="h-12 w-auto" />
          </Link>
          <p className="text-sm text-muted max-w-md leading-relaxed">
            {site.name} is a registered charitable trust (Reg. No. {site.registration}). Every rupee you donate reaches the cause — we run on 0% administrative expenses.
          </p>

          {/* Contact block — address, phone, email. Address is rendered as
              an <address> for semantics; phone uses a tel: link so mobile
              browsers offer to dial; email opens the user's mail client. */}
          {/* Address + phone are bumped to the ink (primary) colour and
              weighted medium so they read as a distinct contact card rather
              than disappearing into the body copy. Email keeps the muted
              colour to avoid three competing emphasis lines. */}
          <address className="not-italic mt-5 space-y-1.5 text-sm max-w-md leading-relaxed">
            <p className="text-ink font-medium">{site.address}</p>
            <p>
              <a href={`tel:${site.phone.replace(/\s+/g, "")}`} className="text-accent-600 font-semibold hover:text-accent-700 underline-offset-4 hover:underline">{site.phone}</a>
            </p>
            <p className="text-muted">
              <a href={`mailto:${site.email}`} className="hover:text-accent-600 underline-offset-4 hover:underline">{site.email}</a>
            </p>
          </address>

          {/* Social icons. Only render those that are configured (some are
              empty strings in lib/data/site.ts so we filter them out). */}
          <div className="mt-5 flex items-center gap-3">
            {site.social.facebook && (
              <a
                href={site.social.facebook}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="MicroCharity on Facebook"
                className="inline-flex items-center justify-center w-9 h-9 rounded-full border border-[var(--color-line)] text-muted hover:text-accent-600 hover:border-accent-600 transition"
              >
                {/* Facebook 'f' glyph, sized 16x16 within the 36px round button. */}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M13.5 21v-7.5h2.5l.4-3h-2.9V8.6c0-.9.3-1.5 1.6-1.5h1.7V4.4c-.3 0-1.3-.1-2.4-.1-2.4 0-4 1.4-4 4v2.2H8v3h2.4V21h3.1Z" />
                </svg>
              </a>
            )}
            {site.social.twitter && (
              <a
                href={site.social.twitter}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="MicroCharity on X / Twitter"
                className="inline-flex items-center justify-center w-9 h-9 rounded-full border border-[var(--color-line)] text-muted hover:text-accent-600 hover:border-accent-600 transition"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M17.5 3h3.2l-7 8 8.2 10h-6.4l-5-6.6L4.7 21H1.5l7.5-8.6L1.2 3h6.6l4.5 6 5.2-6Zm-1.1 16h1.8L7.7 4.9H5.8L16.4 19Z" />
                </svg>
              </a>
            )}
            {site.social.youtube && (
              <a
                href={site.social.youtube}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="MicroCharity on YouTube"
                className="inline-flex items-center justify-center w-9 h-9 rounded-full border border-[var(--color-line)] text-muted hover:text-accent-600 hover:border-accent-600 transition"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M21.6 7.2a2.5 2.5 0 0 0-1.7-1.7C18.3 5 12 5 12 5s-6.3 0-7.9.5A2.5 2.5 0 0 0 2.4 7.2 26 26 0 0 0 2 12a26 26 0 0 0 .4 4.8 2.5 2.5 0 0 0 1.7 1.7c1.6.5 7.9.5 7.9.5s6.3 0 7.9-.5a2.5 2.5 0 0 0 1.7-1.7A26 26 0 0 0 22 12a26 26 0 0 0-.4-4.8ZM10 15V9l5.2 3L10 15Z" />
                </svg>
              </a>
            )}
          </div>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-ink mb-3 font-sans uppercase tracking-wider">Explore</h4>
          <ul className="space-y-2 text-sm">
            <li><Link href="/who-we-are" className="hover:text-accent-600">Who We Are</Link></li>
            <li><Link href="/how-we-work" className="hover:text-accent-600">How We Work</Link></li>
            <li><Link href="/current-causes" className="hover:text-accent-600">Causes Supported</Link></li>
            <li><Link href="/success-stories" className="hover:text-accent-600">Success Stories</Link></li>
            <li><Link href="/refer-a-cause" className="hover:text-accent-600">Refer a Cause</Link></li>
          </ul>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-ink mb-3 font-sans uppercase tracking-wider">Trust</h4>
          <ul className="space-y-2 text-sm">
            <li><Link href="/legal-financial" className="hover:text-accent-600">Financials</Link></li>
            <li><Link href="/terms-conditions" className="hover:text-accent-600">Terms &amp; Conditions</Link></li>
            <li><Link href="/privacy-policy" className="hover:text-accent-600">Privacy Policy</Link></li>
            <li><Link href="/refund-policy" className="hover:text-accent-600">Refund Policy</Link></li>
            <li><Link href="/contact-us" className="hover:text-accent-600">Contact Us</Link></li>
          </ul>
        </div>
      </div>

      <div className="border-t border-[var(--color-line)]">
        <div className="container-page py-5 flex flex-col md:flex-row items-center justify-between gap-2 text-xs text-muted">
          <p>© {year} {site.name} Trust. Established {site.established}. All rights reserved.</p>
          <p>Donations are eligible for tax exemption under Section 80G.</p>
        </div>
      </div>
    </footer>
  );
}
