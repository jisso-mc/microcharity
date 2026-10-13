import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import EditDonationForm from "./EditDonationForm";

export const metadata = { title: "Edit donation — Admin" };
export const dynamic = "force-dynamic";

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export default async function EditDonationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [donation, causes, donors] = await Promise.all([
    prisma.donation.findUnique({
      where: { id },
      select: {
        id: true, status: true, type: true, amount: true, createdAt: true,
        donorId: true, donorNameSnapshot: true, donorEmailSnapshot: true, causeId: true,
        receipt: { select: { receiptNumber: true, sentAt: true } },
      },
    }),
    // Every cause (drafts included) so a donation can be moved anywhere.
    prisma.cause.findMany({
      select: { id: true, title: true, status: true },
      orderBy: [{ status: "asc" }, { title: "asc" }],
    }),
    prisma.donor.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, email: true, phone: true, address: true },
      orderBy: { name: "asc" },
    }),
  ]);
  if (!donation) notFound();

  // Current donor may be soft-deleted (so missing from the picker list) — still show it as selected.
  const currentDonor =
    donors.find(d => d.id === donation.donorId) ??
    (donation.donorId
      ? { id: donation.donorId, name: donation.donorNameSnapshot, email: donation.donorEmailSnapshot, phone: null, address: null }
      : null);

  return (
    <div className="max-w-2xl">
      <Link href="/admin/donations" className="text-sm text-muted hover:text-ink mb-4 inline-block">← Back to donations</Link>
      <h1 className="font-display text-3xl text-ink mb-2">Edit donation</h1>
      <p className="text-sm text-muted mb-6">
        Status: <strong className="text-ink">{donation.status.toLowerCase()}</strong>
        {donation.receipt && <> · Receipt <strong className="text-ink">{donation.receipt.receiptNumber}</strong>{donation.receipt.sentAt ? " (emailed)" : ""}</>}
      </p>

      {donation.status === "APPROVED" && (
        <div className="rounded-lg bg-yellow-50 border border-yellow-200 px-4 py-3 text-sm text-yellow-800 mb-6">
          This donation is approved — saving moves its amount between the old and new cause / donor totals.
          {donation.receipt?.sentAt && " The receipt already emailed won't change; use Resend receipt afterwards to send a corrected one (same receipt number)."}
        </div>
      )}

      <div className="rounded-2xl bg-white border border-[var(--color-line)] p-6 md:p-8">
        <EditDonationForm
          donationId={donation.id}
          donors={donors}
          causes={causes}
          initial={{
            donor: currentDonor,
            causeId: donation.causeId,
            type: donation.type,
            amount: donation.amount,
            date: new Date(donation.createdAt.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10),
          }}
        />
      </div>
    </div>
  );
}
