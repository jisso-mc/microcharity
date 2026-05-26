import { after, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSession, verifyPassword, hashPassword, needsRehash, sessionCookieName, sessionMaxAge } from "@/lib/auth";
import { rateLimit, callerIp, LIMITS } from "@/lib/rate-limit";

// Force this route onto the Node.js runtime (Prisma doesn't run on Edge).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Pre-computed bcrypt hash for the literal string "dummy-not-a-real-password" at cost 10.
// We compare against this when the user doesn't exist (or has no password set yet) so the
// failed-login response time is indistinguishable from a wrong-password response. Cost MUST
// match the BCRYPT_COST in lib/auth.ts so missing-user timing matches real-user timing —
// otherwise the missing-user path would short-circuit faster and leak which emails exist.
const DUMMY_HASH = "$2a$10$zMn0Z9039d400cwC3eLF/u7PKbgonq5OWpXqEWQUoJAcckPB7UqiG";

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

export async function POST(req: Request) {
  try {
    // 1. IP-based rate limit — protects against credential-stuffing across many emails.
    const ip = callerIp(req);
    const rl = await rateLimit(LIMITS.login, ip);
    if (!rl.ok) {
      return NextResponse.json(
        { error: "Too many login attempts. Please wait a minute and try again." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } }
      );
    }

    const { email, password } = await req.json().catch(() => ({}));
    if (!email || !password) {
      return NextResponse.json({ error: "Email and password required" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email: String(email).toLowerCase() } });

    // 2. Account lockout — if too many recent failures, refuse without even hashing.
    if (user?.lockedUntil && user.lockedUntil > new Date()) {
      return NextResponse.json(
        { error: "Account temporarily locked due to repeated failed sign-ins. Try again later." },
        { status: 423 }
      );
    }

    // 3. Constant-time-ish password check: always run bcrypt, against either the real hash
    //    or the dummy. Same generic error whether the user is missing, has no passwordHash
    //    (pending invite), or supplied a wrong password.
    const passwordHash = user?.isActive ? user.passwordHash : null;
    const ok = await verifyPassword(String(password), passwordHash ?? DUMMY_HASH);
    const authenticated = !!user && !!passwordHash && ok;

    if (!authenticated) {
      // 4. Track failed attempts on the real user row, if there was one — this is the
      //    per-account lockout. If the user doesn't exist or is inactive, we skip this
      //    so we don't let an attacker map valid emails by side-effect.
      if (user && user.isActive && user.passwordHash) {
        const attempts = (user.failedLoginAttempts ?? 0) + 1;
        const update: { failedLoginAttempts: number; lockedUntil?: Date } = { failedLoginAttempts: attempts };
        if (attempts >= MAX_FAILED_ATTEMPTS) {
          update.lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
          update.failedLoginAttempts = 0; // reset after lockout begins
        }
        await prisma.user.update({ where: { id: user.id }, data: update });
      }
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    // 5. Success path — build + sign the session token immediately. Everything
    //    else (lastLoginAt stamp, lockout reset, opportunistic rehash) is
    //    deferred via after() so the response goes out the door without
    //    waiting on extra DB round-trips. Saves ~200-300ms perceived latency
    //    on the login flow.
    const token = await createSession({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });

    const res = NextResponse.json({ ok: true });
    res.cookies.set(sessionCookieName, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: sessionMaxAge,
    });

    after(async () => {
      try {
        // If the stored hash is at a higher cost than our current target,
        // re-hash with the cheaper cost and store back. Next sign-in then runs
        // ~4x faster. We have the plaintext password available here as it was
        // just verified, so this is the natural place to migrate.
        const newHash = needsRehash(user.passwordHash!) ? await hashPassword(String(password)) : null;
        await prisma.user.update({
          where: { id: user.id },
          data: {
            lastLoginAt: new Date(),
            failedLoginAttempts: 0,
            lockedUntil: null,
            ...(newHash ? { passwordHash: newHash } : {}),
          },
        });
      } catch (e) {
        // Background failure shouldn't surface to the user — they're already
        // signed in. Log so we can spot regressions in Vercel function logs.
        console.error("[auth/login] post-login update failed", e);
      }
    });

    return res;
  } catch (e) {
    console.error("[auth/login]", e);
    return NextResponse.json(
      { error: "Server error. Please try again — and check that DATABASE_URL is set in Vercel." },
      { status: 500 }
    );
  }
}
