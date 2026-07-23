import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import EditCauseForm from "../EditCauseForm";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return { title: `Edit ${slug} — Admin` };
}

// Render a Date as YYYY-MM-DD (for <input type="date">). startDate is stored at
// UTC noon (see the create/edit actions), so reading UTC components avoids any
// timezone off-by-one when the admin browser is in IST.
function toDateInputValue(d: Date | null): string | null {
  if (!d) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default async function EditCausePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const cause = await prisma.cause.findUnique({
    where: { slug },
    select: {
      id: true, slug: true, title: true, summary: true, goalAmount: true,
      featuredImage: true, beneficiaryKey: true, category: true, location: true,
      startDate: true, mcId: true,
    },
  });
  if (!cause) notFound();

  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <Link href={`/admin/causes/${cause.slug}`} className="text-sm text-muted hover:text-ink mb-4 inline-block">← Back to cause</Link>
        <h1 className="font-display text-3xl text-ink">Edit cause details</h1>
        <p className="text-sm text-muted mt-1">
          {cause.title}
          {cause.mcId && <span className="font-mono ml-2">{cause.mcId}</span>}
        </p>
        <p className="text-xs text-muted mt-1">
          Timeline entries, status (draft/published/closed), and announcements are managed on the{" "}
          <Link href={`/admin/causes/${cause.slug}`} className="text-accent-700 hover:text-accent-600 font-semibold">cause page</Link>.
        </p>
      </div>

      <div className="rounded-2xl bg-white border border-[var(--color-line)] p-6">
        <EditCauseForm
          cause={{
            id: cause.id,
            slug: cause.slug,
            title: cause.title,
            summary: cause.summary ?? "",
            goalAmount: cause.goalAmount,
            featuredImage: cause.featuredImage,
            beneficiaryKey: cause.beneficiaryKey ?? "",
            category: cause.category ?? "",
            location: cause.location ?? "",
            startDateISO: toDateInputValue(cause.startDate),
          }}
        />
      </div>
    </div>
  );
}
