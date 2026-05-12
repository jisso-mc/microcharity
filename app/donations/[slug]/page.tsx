import { notFound } from "next/navigation";
import Link from "next/link";
import { getAllCampaigns, findCampaign } from "@/lib/data/causes";

export const revalidate = 60;
import { inrShort } from "@/lib/format";
import DonateForm from "./DonateForm";
import ShareButtons from "@/components/ShareButtons";

export async function generateStaticParams() {
  const all = await getAllCampaigns();
  return all.map(c => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const found = await findCampaign(slug);
  if (!found) return { title: "Cause not found" };
  const { campaign } = found;
  const path = `/donations/${slug}`;
  const images = campaign.image ? [campaign.image] : undefined;
  return {
    title: campaign.title,
    description: campaign.summary,
    alternates: { canonical: path },
    openGraph: {
      title: campaign.title,
      description: campaign.summary,
      url: path,
      type: "article",
      images,
    },
    twitter: {
      card: "summary_large_image",
      title: campaign.title,
      description: campaign.summary,
      images,
    },
  };
}

export default async function CausePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const found = await findCampaign(slug);
  if (!found) notFound();
  const { campaign, beneficiary } = found;

  const pct = campaign.goal > 0 ? Math.min(100, Math.round((campaign.raised / campaign.goal) * 100)) : 0;
  const fmt = inrShort;
  const remaining = Math.max(0, campaign.goal - campaign.raised);
  const other = beneficiary.campaigns.filter(c => c.slug !== campaign.slug);

  return (
    <>
      <section className="border-b border-[var(--color-line)]">
        <div className="container-page py-6 text-sm text-muted">
          <Link href="/current-causes" className="hover:text-accent-600">Causes</Link>
          <span className="mx-2">/</span>
          <span className="text-ink">{beneficiary.beneficiary}</span>
        </div>
      </section>

      <section className="container-page py-10 md:py-14 grid lg:grid-cols-12 gap-10">
        <div className="lg:col-span-7">
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--color-line)] px-3 py-1 text-xs font-semibold text-ink mb-4">
            <span className={`w-1.5 h-1.5 rounded-full ${campaign.status === "active" ? "bg-accent-600 animate-pulse" : "bg-muted"}`}></span>
            {campaign.status === "active" ? "Active cause" : "Closed cause"}
          </span>

          <h1 className="font-display text-3xl md:text-5xl text-ink leading-[1.1] mb-4">{campaign.title}</h1>

          {campaign.image && (
            <div className="aspect-[16/9] rounded-2xl overflow-hidden bg-[var(--color-soft)] border border-[var(--color-line)] mb-8">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={campaign.image} alt={campaign.title} className="w-full h-full object-cover" loading="eager" />
            </div>
          )}

          {/*
            Each cause owns its own cumulative timeline (the active / latest cause holds the
            full unified history of the beneficiary; older causes are legacy snapshots). So we
            render only this campaign's updates — no merging across the beneficiary's other
            causes.
          */}
          {(() => {
            const allUpdates = campaign.updates;
            if (allUpdates.length > 0) {
              return (
                <div className="space-y-8">
                  {allUpdates.map((u, i) => (
                    <article key={i} className="border-l-2 border-[var(--color-line)] pl-5 md:pl-7 relative">
                      <span className="absolute -left-[7px] top-1.5 w-3 h-3 rounded-full bg-accent-600 border-2 border-white"></span>
                      {u.caption && (
                        <p className="text-xs font-semibold text-accent-600 uppercase tracking-wider mb-2">{u.caption}</p>
                      )}
                      <div className="prose-mc max-w-none">
                        {u.body.split(/\r?\n\r?\n/).map(p => p.trim()).filter(Boolean).map((p, j) => <p key={j}>{p}</p>)}
                      </div>
                    </article>
                  ))}
                </div>
              );
            }
            if (campaign.summary) {
              return (
                <div className="prose-mc max-w-none">
                  {campaign.summary.split(/\r?\n\r?\n/).map(p => p.trim()).filter(Boolean).map((p, i) => <p key={i}>{p}</p>)}
                </div>
              );
            }
            return null;
          })()}
        </div>

        <aside className="lg:col-span-5 lg:pl-4">
          <div className="lg:sticky lg:top-28 space-y-6">
            <div className="rounded-2xl border border-[var(--color-line)] bg-white p-6 md:p-8">
              {/*
                "Support MicroCharity" is the unrestricted-giving page — no goal, no
                progress bar, just a donate form. Every other cause shows raised /
                goal / % funded as usual.
              */}
              {campaign.slug === "support-microcharity" ? (
                <>
                  <p className="font-display text-2xl md:text-3xl text-ink leading-tight">Support MicroCharity</p>
                  <p className="text-sm text-muted mt-2 leading-relaxed">
                    Every contribution funds the running of MicroCharity. 100% of donations to specific causes reach the beneficiaries — your support here covers the operations.
                  </p>
                  <DonateForm slug={campaign.slug} />
                </>
              ) : (
                <>
                  <p className="font-display text-3xl md:text-4xl text-accent-600 leading-none">{fmt(campaign.raised)}</p>
                  <p className="text-sm text-muted mt-1">raised of {fmt(campaign.goal)} goal</p>

                  <div className="mt-4 h-2 rounded-full bg-[var(--color-line)] overflow-hidden">
                    <div className="h-full bg-accent-600 rounded-full" style={{ width: `${pct}%` }}></div>
                  </div>

                  <div className="mt-3 flex items-baseline justify-between text-xs">
                    <span className="font-semibold text-ink">{pct}% funded</span>
                    {campaign.status === "active" && remaining > 0 && (
                      <span className="text-muted">{fmt(remaining)} to go</span>
                    )}
                  </div>

                  {campaign.status === "active" ? (
                    <DonateForm slug={campaign.slug} />
                  ) : (
                    <div className="mt-6 rounded-lg bg-[var(--color-soft)] border border-[var(--color-line)] p-4 text-sm">
                      <p className="font-semibold text-ink">This cause is closed.</p>
                      <p className="text-muted mt-1">Thank you to everyone who contributed.</p>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Share — pulls OG image + description from page metadata when shared */}
            <div className="rounded-2xl border border-[var(--color-line)] bg-white p-6">
              <ShareButtons
                path={`/donations/${campaign.slug}`}
                title={campaign.title}
                text={campaign.summary}
              />
            </div>

            {other.length > 0 && (
              <div className="rounded-2xl border border-[var(--color-line)] bg-white p-6">
                <h3 className="font-display text-lg text-ink mb-1">Other campaigns for this beneficiary</h3>
                <p className="text-xs text-muted mb-4">{beneficiary.campaigns.length} total · {fmt(beneficiary.totalRaised)} raised over time</p>
                <ul className="space-y-3">
                  {other.map(o => {
                    // datePosted is "YYYY-MM-DD" — render as "Mon YYYY" so admins / donors can
                    // distinguish multiple campaigns for the same beneficiary at a glance.
                    const launched = o.datePosted
                      ? new Date(o.datePosted).toLocaleDateString("en-IN", { month: "short", year: "numeric" })
                      : null;
                    return (
                      <li key={o.slug}>
                        <Link href={`/donations/${o.slug}`} className="block rounded-lg border border-[var(--color-line)] hover:border-accent-600 p-3 transition">
                          <div className="flex items-baseline justify-between gap-3">
                            <span className="text-sm font-semibold text-ink">{o.title}</span>
                            <span className={`text-[10px] uppercase tracking-wider font-semibold ${o.status === "active" ? "text-accent-600" : "text-muted"}`}>
                              {o.status}
                            </span>
                          </div>
                          <div className="text-xs text-muted mt-1 flex flex-wrap gap-x-2">
                            <span>{fmt(o.raised)} of {fmt(o.goal)}</span>
                            {launched && <span aria-hidden="true">·</span>}
                            {launched && <span>Launched {launched}</span>}
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        </aside>
      </section>
    </>
  );
}
