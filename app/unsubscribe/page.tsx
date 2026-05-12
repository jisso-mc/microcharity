import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { verifyUnsubscribeToken } from "@/lib/announcements";
import UnsubscribeForm from "./UnsubscribeForm";

export const metadata = {
  title: "Unsubscribe — MicroCharity",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

// Two-step pattern: arriving at the URL doesn't immediately unsubscribe. Some email
// clients prefetch / sanitise links and would otherwise accidentally unsubscribe.
// The user has to explicitly click "Confirm unsubscribe" — only that submit triggers
// the change (see UnsubscribeForm + /api/unsubscribe).
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; token?: string }>;
}) {
  const sp = await searchParams;
  const email = (sp.email ?? "").trim().toLowerCase();
  const token = (sp.token ?? "").trim();

  const tokenOk = email && token && verifyUnsubscribeToken(email, token);
  let donorAlreadyOut = false;
  if (tokenOk) {
    const d = await prisma.donor.findUnique({ where: { email }, select: { unsubscribed: true } });
    donorAlreadyOut = d?.unsubscribed === true;
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-[var(--color-soft)] px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.jpg" alt="MicroCharity" className="h-10 w-auto mx-auto mb-4" />
          <h1 className="font-display text-2xl text-ink">Unsubscribe</h1>
        </div>
        <div className="rounded-2xl bg-white border border-[var(--color-line)] p-6 md:p-8 space-y-4">
          {!tokenOk ? (
            <>
              <p className="text-sm text-ink">
                This unsubscribe link looks invalid or expired. If you&apos;d like to stop receiving emails,
                reply to <a href="mailto:info@microcharity.com" className="text-accent-600 hover:text-accent-700 font-semibold">info@microcharity.com</a> and we&apos;ll handle it manually.
              </p>
              <p className="pt-2"><Link href="/" className="text-sm text-muted hover:text-ink">← Back to MicroCharity</Link></p>
            </>
          ) : donorAlreadyOut ? (
            <>
              <p className="text-sm text-ink">You&apos;re already unsubscribed. <strong>{email}</strong> won&apos;t receive any more emails from MicroCharity.</p>
              <p className="text-xs text-muted">Changed your mind? Reply to info@microcharity.com to resubscribe.</p>
              <p className="pt-2"><Link href="/" className="text-sm text-muted hover:text-ink">← Back to MicroCharity</Link></p>
            </>
          ) : (
            <UnsubscribeForm email={email} token={token} />
          )}
        </div>
      </div>
    </main>
  );
}
