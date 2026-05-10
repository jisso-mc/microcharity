import ApplicationForm from "./ApplicationForm";

// Unlisted public page — there is no link to it from the site nav. It's also blocked
// from search-engine indexing via app/robots.ts. Admin shares the URL directly with
// applicants.
export const metadata = {
  title: "Application Form — MicroCharity",
  description: "MicroCharity application intake form.",
  robots: { index: false, follow: false },
};

export default function CauseApplicationsPage() {
  return (
    <div className="min-h-screen bg-[var(--color-soft)]">
      <header className="bg-white border-b border-[var(--color-line)]">
        <div className="container-page py-6">
          <div className="text-[11px] uppercase tracking-wider font-semibold text-accent-600">MicroCharity Trust</div>
          <h1 className="font-display text-2xl md:text-3xl text-ink mt-1">Application Form</h1>
          <p className="text-sm text-muted mt-2 max-w-2xl">
            Please pick the application type below and complete the form. Your details will be
            reviewed by our team and we&apos;ll be in touch via email or phone.
          </p>
        </div>
      </header>
      <main className="container-page py-8 max-w-3xl">
        <ApplicationForm />
      </main>
    </div>
  );
}
