import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import LoginForm from "./LoginForm";

export const metadata = { title: "Admin login" };

// The login page must NOT use the admin layout's chrome (header/nav). It opts out via its own
// minimal layout sibling — see app/admin/login/layout.tsx.
export default async function LoginPage() {
  // Already signed in (back button, bookmark, stale tab) — go straight to the dashboard
  // instead of showing the sign-in form under the admin nav.
  if (await getCurrentUser()) redirect("/admin");

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-soft)] px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.jpg" alt="MicroCharity" className="h-12 w-auto mx-auto mb-4" />
          <h1 className="font-display text-2xl text-ink">Admin sign in</h1>
        </div>
        <div className="rounded-2xl bg-white border border-[var(--color-line)] p-6 md:p-8">
          <LoginForm />
        </div>
        <p className="text-xs text-muted text-center mt-6">
          Forgot your password? Contact another admin to reset it.
        </p>
      </div>
    </div>
  );
}
