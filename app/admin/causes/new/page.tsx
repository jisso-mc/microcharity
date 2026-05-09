import Link from "next/link";
import { prisma } from "@/lib/prisma";
import CauseForm from "./CauseForm";

export const metadata = { title: "New cause — Admin" };
export const dynamic = "force-dynamic";

export default async function NewCausePage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const sp = await searchParams;
  const fromSlug = sp.from?.trim();

  let predecessor:
    | {
        slug: string;
        title: string;
        beneficiaryKey: string;
        category: string;
        location: string;
        goal: number;
        image: string;
        // Full timeline of the predecessor — copied verbatim onto the new cause on submit.
        updates: { caption: string; body: string; postedAt: string; sortOrder: number }[];
      }
    | undefined;

  if (fromSlug) {
    const src = await prisma.cause.findUnique({
      where: { slug: fromSlug },
      include: { updates: { orderBy: { sortOrder: "asc" } } },
    });
    if (src) {
      predecessor = {
        slug: src.slug,
        title: src.title,
        beneficiaryKey: src.beneficiaryKey ?? "",
        category: src.category ?? "",
        location: src.location ?? "",
        goal: src.goalAmount,
        image: src.featuredImage ?? "",
        updates: src.updates.map((u) => ({
          caption: u.caption ?? "",
          body: u.body,
          postedAt: u.postedAt.toISOString(),
          sortOrder: u.sortOrder,
        })),
      };
    }
  }

  return (
    <div className="max-w-3xl">
      <Link href="/admin/causes" className="text-sm text-muted hover:text-ink mb-4 inline-block">← Back to causes</Link>
      <h1 className="font-display text-3xl text-ink mb-2">{predecessor ? "New cause (continuing campaign)" : "New cause"}</h1>
      <p className="text-sm text-muted mb-6">
        {predecessor
          ? <>Continuing <strong className="text-ink">{predecessor.title}</strong>. Its full timeline ({predecessor.updates.length} entries) will be copied onto this new cause as read-only history. Below, just enter the new entry&apos;s details.</>
          : <>Search for a previous cause to continue a campaign for the same beneficiary, or fill in the form below to start a brand-new cause.</>}
      </p>

      <div className="rounded-2xl bg-white border border-[var(--color-line)] p-6 md:p-8">
        <CauseForm predecessor={predecessor} />
      </div>
    </div>
  );
}
