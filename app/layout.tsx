import "./globals.css";
import type { Metadata } from "next";
import Script from "next/script";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { site } from "@/lib/data/site";

// Google Tag Manager container ID. Hardcoded rather than env-var-driven
// because (a) it isn't a secret and (b) baking it into the bundle avoids an
// extra layer of "did we set this in Vercel?" debugging. Swap the value if
// the container ever changes; we do not run different containers per env.
const GTM_ID = "GTM-P767SNP8";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.microcharity.com"),
  title: { default: `${site.name} — ${site.tagline}`, template: `%s — ${site.name}` },
  description: `${site.name} is a registered charitable trust supporting individual causes — education, medical emergencies, child health, women empowerment, and environment.`,
  icons: [
    { rel: "icon", url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
    { rel: "icon", url: "/favicon.png", sizes: "192x192", type: "image/png" },
    { rel: "apple-touch-icon", url: "/favicon.png" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Manrope:wght@400;500;600;700;800&display=swap"
        />
        {/* Google Tag Manager — the head snippet. Loaded with "afterInteractive"
            so GTM (and everything it pulls in: GA4, etc.) does not block
            first paint or hurt Core Web Vitals. Using inline content rather
            than src so dataLayer is initialised in the exact order Google
            documents. */}
        <Script
          id="gtm-base"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
              new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
              j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
              'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
              })(window,document,'script','dataLayer','${GTM_ID}');`,
          }}
        />
      </head>
      <body className="min-h-screen flex flex-col">
        {/* GTM noscript fallback — fires for the ~0.1% of visitors with JS
            disabled. Lives directly after <body> per Google's docs. */}
        <noscript>
          <iframe
            src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
            height="0"
            width="0"
            style={{ display: "none", visibility: "hidden" }}
          />
        </noscript>
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
