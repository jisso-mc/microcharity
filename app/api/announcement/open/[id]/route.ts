import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 43-byte transparent 1x1 GIF — the smallest possible tracking pixel.
const PIXEL_BYTES = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

// GET /api/announcement/open/[id]
//
// Hit by the <img> pixel in announcement emails. Records the first open
// timestamp on the recipient row and bumps CauseAnnouncement.openCount once.
// All errors swallowed — we never want a tracking failure to surface as a
// broken-image icon in a donor's email client.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  try {
    if (id) {
      // Only the first open per recipient transitions null → timestamp and
      // bumps the announcement-level openCount. Repeat fetches no-op.
      const recipient = await prisma.announcementRecipient.findUnique({
        where: { id },
        select: { id: true, announcementId: true, openedAt: true },
      });
      if (recipient && !recipient.openedAt) {
        await prisma.$transaction([
          prisma.announcementRecipient.update({
            where: { id: recipient.id },
            data: { openedAt: new Date() },
          }),
          prisma.causeAnnouncement.update({
            where: { id: recipient.announcementId },
            data: { openCount: { increment: 1 } },
          }),
        ]);
      }
    }
  } catch (e) {
    console.error("[announcement/open]", e);
  }

  return new NextResponse(PIXEL_BYTES, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Content-Length": String(PIXEL_BYTES.length),
      // Don't cache — we want every open counted across mail clients that
      // re-fetch images on revisit (Apple Mail Privacy Protection caches
      // server-side anyway, so this is mostly for non-AMPP clients).
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache",
    },
  });
}
