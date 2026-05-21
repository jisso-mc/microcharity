import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/announcement/click/[id]?to=<absolute url>
//
// Bounce endpoint for every link in an announcement email. Records the click
// against the recipient row, bumps CauseAnnouncement.clickCount once (on the
// recipient's FIRST click — repeat clicks still increment per-recipient
// clickCount), then 302s onward to `to`.
//
// We validate that `to` parses as an http(s) URL but otherwise let any
// destination through — the link set is generated server-side from our own
// templates, so the universe is bounded.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { searchParams } = new URL(req.url);
  const to = searchParams.get("to") ?? "";

  // Validate destination. If it's missing or malformed, fall back to the
  // site root so the donor never lands on an error page.
  let dest = "/";
  try {
    const u = new URL(to);
    if (u.protocol === "http:" || u.protocol === "https:") dest = u.toString();
  } catch { /* ignore — fall back */ }

  try {
    if (id) {
      const recipient = await prisma.announcementRecipient.findUnique({
        where: { id },
        select: { id: true, announcementId: true, firstClickedAt: true },
      });
      if (recipient) {
        const isFirstClick = !recipient.firstClickedAt;
        // Always increment per-recipient clickCount; only bump the
        // announcement-level clickCount on the recipient's first click so
        // it tracks "unique clickers" rather than total clicks.
        if (isFirstClick) {
          await prisma.$transaction([
            prisma.announcementRecipient.update({
              where: { id: recipient.id },
              data: { firstClickedAt: new Date(), clickCount: { increment: 1 } },
            }),
            prisma.causeAnnouncement.update({
              where: { id: recipient.announcementId },
              data: { clickCount: { increment: 1 } },
            }),
          ]);
        } else {
          await prisma.announcementRecipient.update({
            where: { id: recipient.id },
            data: { clickCount: { increment: 1 } },
          });
        }
      }
    }
  } catch (e) {
    console.error("[announcement/click]", e);
  }

  return NextResponse.redirect(dest, { status: 302 });
}
