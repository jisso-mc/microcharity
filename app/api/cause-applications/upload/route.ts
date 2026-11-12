import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { rateLimit, callerIp, LIMITS } from "@/lib/rate-limit";
import { ATTACHMENT_MAX_BYTES, DOC_TYPES } from "@/lib/application-fields";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/cause-applications/upload
//
// Issues short-lived Vercel Blob client tokens so the application form can upload
// attachments straight from the browser (each ≤ 2 MB). Going direct avoids the
// 4.5 MB serverless request-body limit that a multi-file form would otherwise hit.
//
// The token only allows a single file under applications/uploads/, of an allowed
// type, ≤ 2 MB. The submit / edit endpoints re-check every URL with head() before
// storing it, so a token alone can't attach anything to an application.
export async function POST(req: Request) {
  let body: HandleUploadBody;
  try { body = (await req.json()) as HandleUploadBody; } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  if (body.type === "blob.generate-client-token") {
    const rl = await rateLimit(LIMITS.applicationUpload, callerIp(req));
    if (!rl.ok) {
      return NextResponse.json(
        { error: "Too many uploads from your network. Please try again in a while." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } },
      );
    }
  }

  try {
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        if (!/^applications\/uploads\/[a-z0-9-]+(\.[a-z0-9]{1,6})?$/i.test(pathname)) {
          throw new Error("Invalid upload path");
        }
        return {
          allowedContentTypes: DOC_TYPES,
          maximumSizeInBytes: ATTACHMENT_MAX_BYTES,
          addRandomSuffix: true,
        };
      },
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Upload failed" }, { status: 400 });
  }
}
