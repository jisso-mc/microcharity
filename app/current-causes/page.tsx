import PageHero from "@/components/PageHero";
import CauseCard from "@/components/CauseCard";
import { getActiveBeneficiaries, getClosedBeneficiaries } from "@/lib/data/causes";

export const metadata = { title: "Causes Supported" };
export const revalidate = 60;

export default async function CurrentCausesPage() {
  const [activeBeneficiaries, closedBeneficiaries] = await Promise.all([
    getActiveBeneficiaries(),
    getClosedBeneficiaries(),
  ]);
  return (
    <>
      <PageHero
        eyebrow="Open causes"
        title="People who need help right now."
        subtitle="Each cause below has been independently verified by our volunteers. Pick one that moves you — every contribution, however small, counts."
      />

      <div className="container-page py-16 md:py-20">
        {activeBeneficiaries.length > 0 ? (
          <>
            <div className="flex items-end justify-between mb-8">
              <h2 className="font-display text-2xl md:text-3xl text-ink">Active ({activeBeneficiaries.length})</h2>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {activeBeneficiaries.map(b => <CauseCard key={b.key} beneficiary={b} />)}
            </div>
          </>
        ) : (
          <p className="text-muted">No active causes at the moment. Please check back soon.</p>
        )}

        {closedBeneficiaries.length > 0 && (
          <div className="mt-20 pt-16 border-t border-[var(--color-line)]">
            <div className="flex items-end justify-between mb-8">
              <div>
                <h2 className="font-display text-2xl md:text-3xl text-ink">Past causes ({closedBeneficiaries.length})</h2>
                <p className="text-sm text-muted mt-1">Successfully funded with our donors' help. Thank you.</p>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {closedBeneficiaries.map(b => <CauseCard key={b.key} beneficiary={b} />)}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
