import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { inrShort } from "@/lib/format";
import CauseStatusButton from "../CauseStatusButton";
import AnnouncementPanel from "./AnnouncementPanel";
import AddTimelineEntryForm from "./AddTimelineEntryForm";
import DeleteUpdateButton from "./DeleteUpdateButton";
import EditTimelineEntryButton from "./EditTimelineEntryButton";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  PUBLISHED: "Published",
  DRAFT:     "Draft",
  CLOSED:    "Closed",
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return { title: `${slug} — Admin` };
}

export default async function AdminCauseDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const me = await getCurrentUser();
  const cause = await prisma.cause.findUnique({
    where: { slug },
    include: { updates: { orderBy: { sortOrder: "asc" } } },
  });
  if (!cause) notFound();

  // Announcements: only ADMIN-role users get the trigger UI. Editors see history.
  const [optedInDonorCount, announcementsRaw] = await Promise.all([
    prisma.donor.count({ where: { unsubscribed: false, deletedAt: null, email: { contains: "@" } } }),
    prisma.causeAnnouncement.findMany({
      where: { causeId: cause.id },
      orderBy: { startedAt: "desc" },
      select: {
        id: true, subject: true, totalRecipients: true, successCount: true,
        failureCount: true, openCount: true, clickCount: true,
        status: true, isTest: true, startedAt: true, completedAt: true,
      },
    }),
  ]);
  const announcements = announcementsRaw.map((a) => ({
    ...a,
    startedAt: a.startedAt.toISOString(),
    completedAt: a.completedAt?.toISOString() ?? null,
  }));

  const pct = cause.goalAmount > 0 ? Math.min(100, Math.round((cause.raisedAmount / cause.goalAmount) * 100)) : 0;

  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <Link href="/admin/causes" className="text-sm text-muted hover:text-ink mb-4 inline-block">← Back to causes</Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl text-ink">{cause.title}</h1>
            <p className="text-xs font-mono text-muted mt-1">/donations/{cause.slug}</p>
            <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-muted">
              {cause.mcId && <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-line)] bg-[var(--color-soft)] px-2 py-0.5 font-mono text-ink">{cause.mcId}</span>}
              {cause.location && <span>📍 {cause.location}</span>}
            </div>
          </div>
          <Link href={`/donations/${cause.slug}`} target="_blank" className="text-sm font-semibold text-accent-600 hover:text-accent-700">
            View public page →
          </Link>
        </div>
      </div>

      {/* Status + raised summary */}
      <div className="rounded-2xl bg-white border border-[var(--color-line)] p-5 grid sm:grid-cols-3 gap-6">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted font-semibold mb-1">Status</p>
          <p className="font-display text-xl text-ink">{STATUS_LABEL[cause.status]}</p>
          <div className="mt-3 flex items-center gap-3">
            {cause.status === "PUBLISHED" && <CauseStatusButton causeId={cause.id} variant="close" />}
            {cause.status === "CLOSED"    && <CauseStatusButton causeId={cause.id} variant="reopen" />}
            {cause.status === "DRAFT"     && <CauseStatusButton causeId={cause.id} variant="publish" />}
          </div>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-muted font-semibold mb-1">Raised</p>
          <p className="font-display text-xl text-ink">{inrShort(cause.raisedAmount)}</p>
          <p className="text-xs text-muted mt-1">of {inrShort(cause.goalAmount)} goal · {pct}% funded</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-muted font-semibold mb-1">Beneficiary group</p>
          <p className="font-mono text-sm text-ink break-all">{cause.beneficiaryKey ?? "—"}</p>
          <p className="text-xs text-muted mt-1">Multiple campaigns share a key to nest under one beneficiary on the public site.</p>
        </div>
      </div>

      {/* Existing timeline entries */}
      <div>
        <h2 className="font-display text-xl text-ink mb-4">Timeline ({cause.updates.length})</h2>
        {cause.updates.length === 0 ? (
          <p className="text-sm text-muted bg-white border border-dashed border-[var(--color-line)] rounded-2xl p-6 text-center">
            No timeline entries yet. Add one below — it&rsquo;ll appear on the public cause page.
          </p>
        ) : (
          <ul className="space-y-3">
            {cause.updates.map((u) => (
              // `relative` so the inline EditTimelineEntryButton's edit
              // form (absolute, inset-0) overlays this li cleanly when open.
              <li key={u.id} className="relative rounded-2xl bg-white border border-[var(--color-line)] p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    {u.caption && (
                      <p className="text-xs font-semibold text-accent-600 uppercase tracking-wider mb-2">{u.caption}</p>
                    )}
                    <p className="text-sm text-body whitespace-pre-wrap leading-relaxed">{u.body}</p>
                  </div>
                  <div className="flex items-center gap-4 flex-shrink-0">
                    <EditTimelineEntryButton
                      id={u.id}
                      slug={cause.slug}
                      caption={u.caption ?? ""}
                      body={u.body}
                      postedAt={u.postedAt.toISOString()}
                    />
                    <DeleteUpdateButton
                      id={u.id}
                      slug={cause.slug}
                      preview={u.caption?.trim() || u.body.trim().split(/\r?\n/)[0]}
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Add a new timeline entry to this cause. Works at any status —
          DRAFT, PUBLISHED, or CLOSED — so admins can log fund-raising
          approvals / closures / progress without having to duplicate the
          whole cause. */}
      <AddTimelineEntryForm causeId={cause.id} slug={cause.slug} />

      {/* Launch announcement (bulk donor mailer). Hidden for the support-microcharity
          cause itself — it'd loop. ADMIN-role only. */}
      {me?.role === "ADMIN" && cause.slug !== "support-microcharity" && cause.status === "PUBLISHED" && (
        <div>
          <div className="rounded-2xl bg-white border border-[var(--color-line)] p-6">
            <AnnouncementPanel
              causeId={cause.id}
              causeSlug={cause.slug}
              causeTitle={cause.title}
              optedInDonorCount={optedInDonorCount}
              currentUserEmail={me.email}
              history={announcements}
            />
          </div>
        </div>
      )}
    </div>
  );
}
