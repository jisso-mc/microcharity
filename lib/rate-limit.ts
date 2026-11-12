// Postgres-backed fixed-window rate limiter — survives serverless instance churn
// without adding a new dependency (Redis/KV). Each route has its own window size +
// max-count; identifier is typically the caller's IP from `x-forwarded-for`.
//
// Buckets are aligned to the window boundary so concurrent calls increment the same
// row. The unique (key, windowStart) constraint plus an upsert handles the race —
// PostgreSQL serializes the conflict.

import { prisma } from "./prisma";

export type RateLimitConfig = {
  /** Stable name for the bucket, e.g. "login", "donate-online", "cause-application". */
  route: string;
  /** Window size in milliseconds. Common values: 60_000 (1 min), 3_600_000 (1 hr). */
  windowMs: number;
  /** Max requests allowed within one window for a given identifier. */
  max: number;
};

export type RateLimitResult =
  | { ok: true; remaining: number }
  | { ok: false; retryAfterMs: number };

/** Read the caller's best-guess IP from the request, or "unknown" if nothing's there. */
export function callerIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}

/**
 * Atomically increments the bucket for (route, identifier, current-window) and returns
 * whether the request is allowed. Uses Postgres upsert; safe under concurrency.
 *
 * Failures (DB unreachable etc.) fail OPEN — we'd rather serve the user than 500 the
 * whole site if the rate-limiter is down. The caller's other validation still applies.
 */
export async function rateLimit(cfg: RateLimitConfig, identifier: string): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = new Date(Math.floor(now / cfg.windowMs) * cfg.windowMs);
  const key = `${cfg.route}:${identifier}`;

  try {
    const row = await prisma.rateLimitBucket.upsert({
      where: { key_windowStart: { key, windowStart } },
      create: { key, windowStart, count: 1 },
      update: { count: { increment: 1 } },
      select: { count: true },
    });
    if (row.count > cfg.max) {
      const retryAfterMs = (windowStart.getTime() + cfg.windowMs) - now;
      return { ok: false, retryAfterMs: Math.max(retryAfterMs, 1000) };
    }
    return { ok: true, remaining: Math.max(cfg.max - row.count, 0) };
  } catch (e) {
    console.error("[rate-limit] failed open due to DB error", e);
    return { ok: true, remaining: cfg.max };
  }
}

// ---------- Pre-configured buckets per route ----------

export const LIMITS = {
  login:           { route: "login",          windowMs: 60_000,    max: 10 },   // 10 / min / IP
  donateOnline:    { route: "donate-online",  windowMs: 60_000,    max: 6 },
  donateOffline:   { route: "donate-offline", windowMs: 60_000,    max: 6 },
  donateQr:        { route: "donate-qr",      windowMs: 60_000,    max: 6 },
  contact:         { route: "contact",        windowMs: 60_000,    max: 3 },
  referCause:      { route: "refer-cause",    windowMs: 60_000,    max: 3 },
  causeApplication:{ route: "cause-app",      windowMs: 3_600_000, max: 5 },    // 5 / hr / IP
  applicationEdit: { route: "cause-app-edit", windowMs: 3_600_000, max: 20 },   // applicant edit-link saves
  applicationUpload:{ route: "cause-app-upload", windowMs: 3_600_000, max: 60 }, // Blob upload tokens (≤2 MB each)
  acceptInvite:    { route: "accept-invite",  windowMs: 60_000,    max: 5 },
} as const satisfies Record<string, RateLimitConfig>;
