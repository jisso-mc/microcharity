import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { sessionCookieName } from "@/lib/auth";
import LogoutButton from "./LogoutButton";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const sessionUser = await getCurrentUser();

  // Session re-check against the live DB. Middleware only verifies the JWT signature,
  // which means a deactivated / role-demoted user keeps access until their cookie
  // expires (4 days). On every admin request, we cross-check `isActive` and `role`
  // here — the cost is one cheap indexed lookup per page load.
  let user = sessionUser;
  if (sessionUser) {
    const live = await prisma.user.findUnique({
      where: { id: sessionUser.userId },
      select: { id: true, isActive: true, role: true, name: true, email: true },
    });
    if (!live || !live.isActive) {
      // User has been deactivated (or hard-deleted) since their JWT was issued.
      // Clear the cookie and bounce them to login.
      const jar = await cookies();
      jar.delete(sessionCookieName);
      redirect("/admin/login");
    }
    // Reflect any role change without forcing a re-login. We patch the in-memory user
    // so the nav renders the correct items; the JWT will catch up on next sign-in.
    user = { ...sessionUser, role: live.role, name: live.name, email: live.email };
  }

  return (
    <div className="min-h-screen bg-[var(--color-soft)]">
      <header className="bg-white border-b border-[var(--color-line)]">
        <div className="container-page flex flex-wrap items-center gap-4 py-3">
          <Link href="/admin" className="font-display text-lg text-ink">Admin</Link>

          {/* Global search — submits to /admin/search?q=… and matches both causes and donors */}
          <form action="/admin/search" method="get" className="flex-1 min-w-[220px] max-w-md order-3 md:order-2 w-full md:w-auto">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
              </span>
              <input
                type="search"
                name="q"
                placeholder="Search causes or donors…"
                className="w-full rounded-full border border-[var(--color-line)] focus:border-accent-600 focus:ring-2 focus:ring-accent-100 outline-none pl-9 pr-4 py-2 text-sm bg-[var(--color-soft)]"
              />
            </div>
          </form>

          <nav className="flex items-center gap-5 text-sm ml-auto order-2 md:order-3">
            <Link href="/admin/causes" className="text-ink hover:text-accent-600">Causes</Link>
            <Link href="/admin/donations" className="text-ink hover:text-accent-600">Donations</Link>
            <Link href="/admin/donors" className="text-ink hover:text-accent-600">Donors</Link>
            <Link href="/admin/announcements" className="text-ink hover:text-accent-600">Announcements</Link>
            <Link href="/admin/forms" className="text-ink hover:text-accent-600">Forms</Link>
            <Link href="/admin/reports" className="text-ink hover:text-accent-600">Reports</Link>
            {user?.role === "ADMIN" && (
              <Link href="/admin/users" className="text-ink hover:text-accent-600">Users</Link>
            )}
            {user && (
              <div className="hidden lg:flex items-center gap-3 pl-4 border-l border-[var(--color-line)]">
                <Link href="/admin/profile" className="text-xs text-muted hover:text-ink">{user.name} · {user.role === "ADMIN" ? "Admin" : "Editor"}</Link>
                <LogoutButton />
              </div>
            )}
            {user && <div className="lg:hidden"><LogoutButton /></div>}
          </nav>
        </div>
      </header>
      <main className="container-page py-10">{children}</main>
    </div>
  );
}
