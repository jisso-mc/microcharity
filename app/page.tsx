import Link from "next/link";
import CauseCard from "@/components/CauseCard";
import { site } from "@/lib/data/site";
import { activeBeneficiaries } from "@/lib/data/causes";

const valueProps = [
  { title: "0% Admin Costs",  desc: "Every single rupee you donate goes directly to the cause. Operations are run by volunteers." },
  { title: "Tax Benefits (80G)", desc: "All donations to MicroCharity Trust are eligible for tax exemption under Section 80G." },
  { title: "Receipt for Every Donation", desc: "You receive a verified receipt by email immediately after your contribution." },
];

export default function HomePage() {
  const featured = activeBeneficiaries.slice(0, 3);

  return (
    <>
      {/* BANNER — Mother Teresa portrait with the quote overlaid */}
      <section className="relative isolate overflow-hidden bg-[#3b6e6e]">
        {/* Mobile crop: anchor face to upper-right of frame */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/banners/mother-teresa.jpg"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 -z-10 w-full h-full object-cover md:hidden"
          style={{ objectPosition: "30% 25%" }}
        />
        {/* Desktop crop: subject anchored on the left */}
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
            {/* box-decoration-clone gives each wrapped line its own tight highlight, instead of one chunky box */}
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

          <div className="md:col-span-5">
            <div className="rounded-2xl bg-white border border-[var(--color-line)] p-6 md:p-8">
              <p className="text-sm font-semibold text-muted uppercase tracking-wider mb-2">Our impact so far</p>
              <p className="font-display text-4xl md:text-5xl text-accent-600 leading-none">{site.totalRaised}</p>
              <p className="text-sm text-muted mt-1">raised &amp; disbursed</p>
              <div className="my-5 h-px bg-[var(--color-line)]"></div>
              <div className="grid grid-cols-2 gap-4 text-center">
                <div>
                  <p className="font-display text-2xl text-ink">{site.totalDonations}</p>
                  <p className="text-xs text-muted mt-1">micro-donations</p>
                </div>
                <div>
                  <p className="font-display text-2xl text-ink">100%</p>
                  <p className="text-xs text-muted mt-1">reaches the cause</p>
                </div>
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
            <div>
              <p className="text-sm font-semibold text-accent-600 uppercase tracking-wider mb-2">Open causes</p>
              <h2 className="font-display text-3xl md:text-4xl text-ink">People who need help right now</h2>
            </div>
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

      {/* FOCUS AREAS */}
      <section className="bg-white border-t border-[var(--color-line)]">
        <div className="container-page py-20 md:py-24">
          <div className="max-w-2xl mb-12">
            <p className="text-sm font-semibold text-accent-600 uppercase tracking-wider mb-2">What we focus on</p>
            <h2 className="font-display text-3xl md:text-4xl text-ink">Five areas where small help changes everything</h2>
          </div>
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
