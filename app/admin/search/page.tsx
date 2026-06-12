import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { inrShort } from "@/lib/format";
import CauseRowMenu from "../causes/CauseRowMenu";

export const metadata = { title: "Search — Admin" };
export const dynamic = "force-dynamic";

export default async function AdminSearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();

  if (!q) {
    return (
      <div className="max-w-xl">
        <h1 className="font-display text-3xl text-ink">Search</h1>
        <p className="text-sm text-muted mt-2">Type a query in the search box above to find causes by title or slug, and donors by name, email, or phone.</p>
      </div>
    );
  }

  const [causes, donors] = await Promise.all([
    prisma.cause.findMany({
      where: {
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { slug:  { contains: q, mode: "insensitive" } },
        ],
      },
      take: 50,
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      select: {
        id: true, title: true, slug: true, status: true, raisedAmount: true, goalAmount: true,
        _count: { select: { donations: true } },
      },
    }),
    prisma.donor.findMany({
      where: {
        OR: [
          { name:  { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
          { phone: { contains: q, mode: "insensitive" } },
        ],
      },
      take: 50,
      orderBy: { lastDonationAt: "desc" },
    }),
  ]);

  const STATUS_BADGE: Record<string, string> = {
    PUBLISHED: "bg-accent-50 text-accent-700",
    DRAFT:     "bg-[var(--color-soft)] text-muted",
    CLOSED:    "bg-[var(--color-soft)] text-muted",
  };

  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-display text-3xl text-ink">Search results</h1>
        <p className="text-sm text-muted mt-1">
          For <strong className="text-ink">&ldquo;{q}&rdquo;</strong> — {causes.length} cause{causes.length === 1 ? "" : "s"}, {donors.length} donor{donors.length === 1 ? "" : "s"}.
        </p>
      </div>

      <section>
        <h2 className="font-display text-xl text-ink mb-4">Causes ({causes.length})</h2>
        {causes.length === 0 ? (
          <p className="text-sm text-muted">No causes match.</p>
        ) : (
          <div className="rounded-2xl bg-white border border-[var(--color-line)] overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead className="bg-[var(--color-soft)] text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th className="text-left font-semibold px-4 py-3">Title</th>
                  <th className="text-left font-semibold px-3 py-3 w-[7rem]">Status</th>
                  <th className="text-right font-semibold px-3 py-3 w-[8rem]">Raised / Goal</th>
                  <th className="text-right font-semibold px-4 py-3 w-16">Actions</th>
                </tr>
              </thead>
              <tbody>
                {causes.map(c => {
                  const pct = c.goalAmount > 0 ? Math.min(100, Math.round((c.raisedAmount / c.goalAmount) * 100)) : 0;
                  return (
                    <tr key={c.id} className="border-t border-[var(--color-line)] align-top">
                      <td className="px-4 py-3 max-w-[24rem]">
                        <Link href={`/admin/causes/${c.slug}`} className="block text-ink font-medium truncate hover:text-accent-600">
                          {c.title}
                        </Link>
                        <span className="block text-xs text-muted font-mono truncate mt-0.5">{c.slug}</span>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`text-[11px] uppercase tracking-wider font-semibold px-2 py-1 rounded ${STATUS_BADGE[c.status] ?? ""}`}>
                          {c.status.toLowerCase()}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">
                        <span className="block text-ink">{inrShort(c.raisedAmount)}</span>
                        <span className="block text-xs text-muted">of {inrShort(c.goalAmount)} · {pct}%</span>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <CauseRowMenu
                          causeId={c.id}
                          slug={c.slug}
                          causeTitle={c.title}
                          hasDonations={c._count.donations > 0}
                          statusVariant={
                            c.status === "PUBLISHED" ? "close" :
                            c.status === "CLOSED"    ? "reopen" :
                            c.status === "DRAFT"     ? "publish" :
                            null
                          }
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="font-display text-xl text-ink mb-4">Donors ({donors.length})</h2>
        {donors.length === 0 ? (
          <p className="text-sm text-muted">No donors match.</p>
        ) : (
          <div className="rounded-2xl bg-white border border-[var(--color-line)] overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[var(--color-soft)] text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th className="text-left font-semibold px-4 py-3">Name</th>
                  <th className="text-left font-semibold px-4 py-3">Email</th>
                  <th className="text-left font-semibold px-4 py-3">Phone</th>
                  <th className="text-right font-semibold px-4 py-3">Donations</th>
                  <th className="text-right font-semibold px-4 py-3">Total</th>
                </tr>
              </thead>
              <tbody>
                {donors.map(d => (
                  <tr key={d.id} className="border-t border-[var(--color-line)]">
                    <td className="px-4 py-3 text-ink">{d.name}</td>
                    <td className="px-4 py-3 text-muted">{d.email}</td>
                    <td className="px-4 py-3 text-muted">{d.phone ?? "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{d.donationCount}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{inrShort(d.totalDonated)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
