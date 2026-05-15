import Link from "next/link";
import { headlineCampaign, type Beneficiary } from "@/lib/data/causes";
import { inrShort } from "@/lib/format";

interface Props { beneficiary: Beneficiary }

export default function CauseCard({ beneficiary }: Props) {
  const c = headlineCampaign(beneficiary);
  const pct = c.goal > 0 ? Math.min(100, Math.round((c.raised / c.goal) * 100)) : 0;
  const fmt = inrShort;
  const otherCount = beneficiary.campaigns.length - 1;
  // datePosted is "YYYY-MM-DD" off the data layer — format as "Mon YYYY" so
  // admins / donors can tell campaigns apart at a glance.
  const launched = c.datePosted
    ? new Date(c.datePosted).toLocaleDateString("en-IN", { month: "short", year: "numeric" })
    : null;

  return (
    <article className="group flex flex-col rounded-[var(--radius-card)] border border-[var(--color-line)] bg-white overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300">
      <Link href={`/donations/${c.slug}`} className="block aspect-[16/10] bg-[var(--color-soft)] relative border-b border-[var(--color-line)] overflow-hidden">
        {c.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.image} alt={c.title} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-ink/15 font-display text-6xl font-bold">
            {beneficiary.beneficiary.split(" ").map(s => s[0]).slice(0, 2).join("")}
          </div>
        )}
        {c.status === "active" && (
          <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-accent-600 border border-[var(--color-line)]">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-600 animate-pulse"></span>
            Active
          </span>
        )}
      </Link>

      <div className="p-5 flex-1 flex flex-col">
        <h3 className="font-display text-lg leading-snug text-ink mb-1 group-hover:text-accent-600 transition">
          <Link href={`/donations/${c.slug}`}>{c.title}</Link>
        </h3>
        {launched && (
          <p className="text-xs text-muted mb-2">
            <span className="font-semibold uppercase tracking-wider">Started</span> {launched}
          </p>
        )}
        {c.summary && (
          <p className="text-sm text-muted leading-relaxed line-clamp-2 mb-4">{c.summary}</p>
        )}

        <div className="mt-auto">
          <div className="flex items-baseline justify-between text-xs mb-1.5">
            <span className="font-semibold text-ink">{fmt(c.raised)} <span className="font-normal text-muted">raised</span></span>
            <span className="text-muted">of {fmt(c.goal)}</span>
          </div>
          <div className="h-1.5 rounded-full bg-[var(--color-line)] overflow-hidden">
            <div className="h-full bg-accent-600 rounded-full" style={{ width: `${pct}%` }}></div>
          </div>
          <div className="mt-4 flex items-center justify-between gap-3">
            <span className="text-xs font-semibold text-ink">{pct}% funded</span>
            {otherCount > 0 && (
              <span className="text-xs text-muted">+ {otherCount} past campaign{otherCount > 1 ? "s" : ""}</span>
            )}
            <Link href={`/donations/${c.slug}`} className="inline-flex items-center gap-1 text-sm font-semibold text-accent-600 hover:text-accent-700 ml-auto">
              {c.status === "active" ? "Donate" : "Details"}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}
