"use server";

import { revalidateSiteTotals } from "@/lib/data/stats";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { audit } from "@/lib/audit";

export type SiteStatsFormState = { error?: string; ok?: true; donationCount?: number; raisedAmount?: number };

// Hard ceilings so a typo (extra zero, missing decimal) can't publish nonsense
// on the home page. Set generous enough to not get in real-world editing's way.
const MAX_COUNT  = 10_000_000;        // 1 crore donations
const MAX_AMOUNT = 100_000_000_000;   // ₹10 thousand crore

export async function saveSiteStatsAction(_prev: SiteStatsFormState, formData: FormData): Promise<SiteStatsFormState> {
  const me = await getCurrentUser();
  if (!me) return { error: "Unauthorized" };
  if (me.role !== "ADMIN") return { error: "Admins only — these numbers go on the public home page." };

  const donationCountRaw = String(formData.get("donationCount") ?? "").replace(/[,\s]/g, "");
  const raisedAmountRaw  = String(formData.get("raisedAmount")  ?? "").replace(/[,₹\s]/g, "");
  const donationCount = Number(donationCountRaw);
  const raisedAmount  = Number(raisedAmountRaw);

  if (!Number.isFinite(donationCount) || donationCount < 0 || donationCount > MAX_COUNT) {
    return { error: `Donation count must be a number between 0 and ${MAX_COUNT.toLocaleString("en-IN")}.` };
  }
  if (!Number.isFinite(raisedAmount) || raisedAmount < 0 || raisedAmount > MAX_AMOUNT) {
    return { error: `Raised amount must be a number between 0 and ₹${MAX_AMOUNT.toLocaleString("en-IN")}.` };
  }

  // FK-safe writer for the audit reference — same pattern as approveDonation
  // etc., handles stale session userIds from a reseeded prod DB.
  const writer = await prisma.user.findUnique({ where: { id: me.userId }, select: { id: true } });

  await prisma.siteStat.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      donationCount: Math.floor(donationCount),
      raisedAmount:  Math.floor(raisedAmount),
      updatedById:   writer?.id ?? null,
    },
    update: {
      donationCount: Math.floor(donationCount),
      raisedAmount:  Math.floor(raisedAmount),
      updatedById:   writer?.id ?? null,
    },
  });

  await audit({
    action: "sitestat.update",
    userId: me.userId,
    entityType: "SiteStat",
    entityId: "1",
    payload: { donationCount, raisedAmount },
  });

  // Bust the home page's ISR cache so the new figures show on the very next visit.
  revalidateSiteTotals();

  return { ok: true, donationCount, raisedAmount };
}
