import Link from "next/link";
import CauseCard from "@/components/CauseCard";
import { site } from "@/lib/data/site";
import { getActiveBeneficiaries, getClosedBeneficiaries, type Beneficiary } from "@/lib/data/causes";

export const revalidate = 60;

// Sort a list of beneficiaries by the date of their most-recent campaign, newest
// first. The data layer keeps each beneficiary's campaigns in chronological order
// (oldest → newest); the last entry's datePosted is therefore the most recent.
function byMostRecentCampaign(a: Beneficiary, b: Beneficiary): number {
  const aDate = a.campaigns[a.campaigns.length - 1]?.datePosted ?? "";
  const bDate = b.campaigns[b.campaigns.length - 1]?.datePosted ?? "";
  return bDate.localeCompare(aDate);
}

const valueProps = [
  { title: "0% Admin Costs",  desc: "Every single rupee you donate goes directly to the cause. Operations are run by volunteers." },
  { title: "Tax Benefits (80G)", desc: "All donations to MicroCharity Trust are eligible for tax exemption under Section 80G." },
  { title: "Receipt for Every Donation", desc: "You receive a verified receipt by email immediately after your contribution." },
];

export default async function HomePage() {
  const [activeAll, closedAll] = await Promise.all([
    getActiveBeneficiaries(),
    getClosedBeneficiaries(),
  ]);
  const featured = activeAll.slice(0, 3);
  // Past causes: newest 6 closed beneficiaries by most-recent campaign date.
  const pastFeatured = [...closedAll].sort(byMostRecentCampaign).slice(0, 6);

  return (
    <>
      {/* BANNER — editorial split (Option C). Quote-first on the left, photo accent on the right. */}
      {/*
        To revert to the previous Mother Teresa portrait banner:
        1. Comment out this <BannerEditorial /> block.
        2. Uncomment the <BannerPortrait /> block below.
        Both components are defined at the bottom of this file.
      */}
      <BannerEditorial />

      {/*
      <BannerPortrait />
      */}

      {/* HERO */}
      <section className="bg-white">
        <div className="container-page pt-16 md:pt-20 pb-16 md:pb-20 grid md:grid-cols-12 gap-10 items-center">
          <div className="md:col-span-7">
            <span className="inline-flex items-center gap-2 rounded-full border border-[var(--color-line)] bg-white px-3 py-1 text-xs font-semibold text-ink mb-5">
              <span className="w-1.5 h-1.5 rounded-full bg-accent-600"></span>
              A registered charitable trust since {site.established}
            </span>
            <h1 className="font-display text-4xl md:text-6xl leading-[1.05] text-ink mb-5">
              Micro contributions <br/>towards <em className="not-italic text-accent-600">Mighty Changes.</em>
            </h1>
            <p className="text-lg text-body max-w-xl leading-relaxed mb-8">
              We take up individual causes — a surgery, a school fee, a small shop — collect what&apos;s needed, and close them transparently. No overheads. No middlemen. Just direct help.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link href="/current-causes" className="inline-flex items-center gap-2 rounded-full bg-accent-600 hover:bg-accent-700 text-white font-semibold px-6 py-3 transition">
                See current causes
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
              </Link>
              <Link href="/how-we-work" className="inline-flex items-center gap-2 rounded-full border border-[var(--color-line)] hover:border-ink hover:text-ink font-semibold px-6 py-3 transition">
                How we work
              </Link>
            </div>
          </div>

          <div className="md:col-span-5 space-y-4">
            {/* ₹1.61 cr raised */}
            <div className="flex gap-4 items-start p-5 rounded-2xl bg-white border border-[var(--color-line)]">
              <div className="w-10 h-10 rounded-full bg-accent-50 text-accent-600 flex items-center justify-center flex-shrink-0">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M9 9.5h4a2 2 0 0 1 0 4H10a2 2 0 0 0 0 4h5"/></svg>
              </div>
              <div className="min-w-0">
                <h3 className="font-display text-lg text-ink mb-1">{site.totalRaised} raised &amp; disbursed</h3>
                <p className="text-sm text-muted leading-relaxed">
                  From {site.totalDonations} micro-donations, supporting hundreds of causes and touching thousands of lives across India.
                </p>
              </div>
            </div>

            {/* 80G tax benefits */}
            <div className="flex gap-4 items-start p-5 rounded-2xl bg-white border border-[var(--color-line)]">
              <div className="w-10 h-10 rounded-full bg-accent-50 text-accent-600 flex items-center justify-center flex-shrink-0">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><polyline points="9 14 11 16 15 12"/></svg>
              </div>
              <div className="min-w-0">
                <h3 className="font-display text-lg text-ink mb-1">Tax benefits under 80G</h3>
                <p className="text-sm text-muted leading-relaxed">
                  All donations are eligible for tax deductions under Section 80G of the Income Tax Act.
                  <span className="block text-xs text-muted/80 mt-1 font-mono">DIT(E)BLR/80G/K-70/AATFM6359B/ITO(E)-2/Vol2014-2015</span>
                </p>
              </div>
            </div>

            {/* 0% admin */}
            <div className="flex gap-4 items-start p-5 rounded-2xl bg-white border border-[var(--color-line)]">
              <div className="w-10 h-10 rounded-full bg-accent-50 text-accent-600 flex items-center justify-center flex-shrink-0">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
              </div>
              <div className="min-w-0">
                <h3 className="font-display text-lg text-ink mb-1">0% administrative expenses</h3>
                <p className="text-sm text-muted leading-relaxed">
                  Every rupee reaches the cause. MicroCharity is run entirely by volunteers, who absorb all overheads on their personal time.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* INTRO */}
      <section className="bg-white border-t border-[var(--color-line)]">
        <div className="container-page py-20 md:py-24 max-w-3xl text-center">
          <h2 className="font-display text-3xl md:text-4xl text-ink mb-5">A trust built for direct, individual impact</h2>
          <p className="text-lg text-body leading-relaxed">
            MicroCharity Trust was founded in {site.established} on a simple idea: support real people facing real, urgent needs — and prove every rupee reached them. Volunteers verify each cause, publish updates, and close the cause with a final report once the goal is met.
          </p>
        </div>
      </section>

      {/* CURRENT CAUSES */}
      <section className="bg-white border-t border-[var(--color-line)]">
        <div className="container-page py-20 md:py-24">
          <div className="flex flex-wrap items-end justify-between gap-4 mb-10">
            <h2 className="font-display text-3xl md:text-4xl text-ink">Open causes</h2>
            <Link href="/current-causes" className="text-sm font-semibold text-accent-600 hover:text-accent-700 inline-flex items-center gap-1">
              View all causes
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
            </Link>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {featured.map(b => <CauseCard key={b.key} beneficiary={b} />)}
          </div>
        </div>
      </section>

      {/* PAST CAUSES — six most-recent closed beneficiaries. View more lands on the
          Success Stories page which lists every closed campaign. */}
      {pastFeatured.length > 0 && (
        <section className="bg-[var(--color-soft)] border-t border-[var(--color-line)]">
          <div className="container-page py-20 md:py-24">
            <div className="flex flex-wrap items-end justify-between gap-4 mb-10">
              <div>
                <h2 className="font-display text-3xl md:text-4xl text-ink">Past causes</h2>
                <p className="text-sm text-muted mt-2 max-w-xl">
                  Closed campaigns we&apos;ve already funded and disbursed. The newest six are below.
                </p>
              </div>
              <Link href="/success-stories" className="text-sm font-semibold text-accent-600 hover:text-accent-700 inline-flex items-center gap-1">
                View more
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
              </Link>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {pastFeatured.map(b => <CauseCard key={b.key} beneficiary={b} />)}
            </div>
          </div>
        </section>
      )}

      {/* FOCUS AREAS */}
      <section className="bg-white border-t border-[var(--color-line)]">
        <div className="container-page py-20 md:py-24">
          <h2 className="font-display text-3xl md:text-4xl text-ink mb-12">What we focus on</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {site.focusAreas.map(area => (
              <div key={area.title} className="rounded-[var(--radius-card)] bg-white border border-[var(--color-line)] p-6 hover:border-accent-600 transition">
                <div className="w-10 h-10 rounded-lg bg-accent-50 text-accent-600 flex items-center justify-center mb-4">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M7 12h10"/></svg>
                </div>
                <h3 className="font-display text-lg text-ink mb-2">{area.title}</h3>
                <p className="text-sm text-muted leading-relaxed">{area.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* VALUE PROPS */}
      <section className="bg-white border-t border-[var(--color-line)]">
        <div className="container-page py-20 md:py-24">
          <div className="grid md:grid-cols-3 gap-6">
            {valueProps.map(v => (
              <div key={v.title} className="p-7 rounded-[var(--radius-card)] border border-[var(--color-line)] bg-white">
                <div className="w-10 h-10 rounded-full bg-accent-600 text-white flex items-center justify-center mb-4">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <h3 className="font-display text-xl text-ink mb-2">{v.title}</h3>
                <p className="text-sm text-body leading-relaxed">{v.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-white border-t border-[var(--color-line)]">
        <div className="container-page py-20 md:py-24">
          <div className="rounded-3xl bg-ink text-white px-8 md:px-16 py-16 md:py-20 grid md:grid-cols-2 gap-8 items-center">
            <div>
              <h2 className="font-display text-3xl md:text-4xl text-white mb-4">Know someone who needs help?</h2>
              <p className="text-white/75 leading-relaxed mb-6 max-w-md">
                Refer a cause to us. Our volunteers verify every case before opening it for donations — and you'll get updates until it closes.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link href="/refer-a-cause" className="inline-flex items-center gap-2 rounded-full bg-accent-600 hover:bg-accent-700 text-white font-semibold px-6 py-3 transition">
                  Refer a cause
                </Link>
                <Link href="/contact-us" className="inline-flex items-center gap-2 rounded-full border border-white/30 hover:border-white text-white font-semibold px-6 py-3 transition">
                  Get in touch
                </Link>
              </div>
            </div>
            <div className="md:justify-self-end">
              <blockquote className="font-display text-xl md:text-2xl leading-relaxed text-white/90 italic max-w-md">
                "It's not how much we give but how much love we put into giving."
                <footer className="not-italic text-sm text-white/60 mt-3">— Mother Teresa</footer>
              </blockquote>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Banner variants                                                           */
/*                                                                            */
/*  BannerEditorial   — current homepage banner (Option C from the preview).  */
/*  BannerPortrait    — the earlier Mother Teresa portrait banner. Kept for   */
/*                      revert; not rendered unless you swap the JSX above.   */
/* -------------------------------------------------------------------------- */

function BannerEditorial() {
  return (
    <section className="bg-[#fdecec] text-ink">
      {/* Grid is NOT wrapped in container-page so the right column can bleed to the viewport edge. */}
      <div className="md:grid md:grid-cols-2 md:items-stretch">
        {/* Left — content padded to align with container-page on wide viewports */}
        <div className="px-5 md:pl-[max(2rem,calc(50vw-568px))] md:pr-10 lg:pr-16 py-12 md:py-20 flex flex-col justify-center">
          <div className="md:max-w-[560px]">
            <p className="font-sans font-bold text-3xl md:text-5xl leading-[1.15] text-ink">
              &ldquo;Not all of us can do great things. But we can do{" "}
              <em className="not-italic italic font-bold text-accent-600">small things</em>{" "}
              with great love.&rdquo;
            </p>

            <div className="mt-6 flex items-center gap-3">
              <span className="block w-1 h-6 rounded-full bg-accent-600"></span>
              <span className="text-sm text-muted">— Mother Teresa</span>
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                href="/current-causes"
                className="inline-flex items-center gap-2 rounded-full bg-accent-600 hover:bg-accent-700 text-white font-semibold px-6 py-3 transition"
              >
                See current causes
              </Link>
              <Link
                href="/how-we-work"
                className="inline-flex items-center gap-2 text-sm font-semibold text-ink hover:text-accent-700"
              >
                How we work
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
              </Link>
            </div>

            <div className="mt-10 pt-6 grid grid-cols-3 gap-4 border-t border-ink/10">
              <div>
                <p className="font-display text-2xl text-ink">{site.totalDonations}+</p>
                <p className="text-xs text-muted mt-0.5">Donations</p>
              </div>
              <div>
                <p className="font-display text-2xl text-ink">100%</p>
                <p className="text-xs text-muted mt-0.5">To the cause</p>
              </div>
              <div>
                <p className="font-display text-2xl text-ink">₹1.61 crores</p>
                <p className="text-xs text-muted mt-0.5">Raised</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right — image bleeds to the viewport edge with a soft fade from the blush panel */}
        <div className="relative min-h-[280px] md:min-h-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/banners/small-things.jpg"
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            style={{ objectPosition: "center 40%" }}
          />
          <div
            className="absolute inset-y-0 left-0 w-24 hidden md:block pointer-events-none"
            style={{ background: "linear-gradient(to right, #fdecec, transparent)" }}
          />
        </div>
      </div>
    </section>
  );
}

// Kept for revert. Not rendered by default.
function BannerPortrait() {
  return (
    <section className="relative isolate overflow-hidden bg-[#3b6e6e]">
      {/* Mobile crop */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/banners/mother-teresa.jpg"
        alt=""
        aria-hidden="true"
        className="absolute inset-0 -z-10 w-full h-full object-cover md:hidden"
        style={{ objectPosition: "30% 25%" }}
      />
      {/* Desktop crop */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/banners/mother-teresa.jpg"
        alt=""
        aria-hidden="true"
        className="absolute inset-0 -z-10 w-full h-full object-cover hidden md:block"
        style={{ objectPosition: "left 35%" }}
      />
      <div className="container-page relative min-h-[340px] md:min-h-[520px] py-8 md:py-20 flex items-end md:items-center">
        <blockquote className="md:ml-auto md:max-w-xl text-white">
          <p className="font-display text-2xl md:text-3xl lg:text-4xl leading-[1.6] italic">
            <span className="box-decoration-clone bg-black/55 px-2 py-1">
              &ldquo;If you can&rsquo;t feed a hundred people, then feed just one.&rdquo;
            </span>
          </p>
          <footer className="not-italic text-sm md:text-base text-white/95 mt-3 md:mt-4 font-sans">
            <span className="box-decoration-clone bg-black/55 px-2 py-1">
              — Mother Teresa
            </span>
          </footer>
        </blockquote>
      </div>
    </section>
  );
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _keepForRevert = BannerPortrait;
