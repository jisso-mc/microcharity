import PageHero from "@/components/PageHero";
import CauseCard from "@/components/CauseCard";
import { getClosedBeneficiaries } from "@/lib/data/causes";
import { getSiteTotals } from "@/lib/data/stats";

export const metadata = { title: "Success Stories" };
export const revalidate = 60;

export default async function SuccessStoriesPage() {
  // Pull the raised total from the admin-edited SiteStat row (same source as
  // the home page) so the headline number stays in lockstep across the site.
  // The previous getGrandTotalRaised() summed live Cause.raisedAmount values
  // and undercounted legacy WordPress-era donations — admins maintain the
  // SiteStat row to backfill those.
  const [closedBeneficiaries, totals] = await Promise.all([
    getClosedBeneficiaries(),
    getSiteTotals(),
  ]);
  return (
    <>
      <PageHero
        eyebrow="What your donations have done"
        title="Stories that found their happy ending."
        subtitle={`Each closed cause is a real life changed. ${closedBeneficiaries.length} beneficiaries supported with ${totals.raisedAmountLabel} raised over the years.`}
      />

      <div className="container-page py-16 md:py-20">
        {closedBeneficiaries.length > 0 ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {closedBeneficiaries.map(b => <CauseCard key={b.key} beneficiary={b} />)}
          </div>
        ) : (
          <p className="text-muted">More success stories will be published here soon.</p>
        )}
      </div>
    </>
  );
}
