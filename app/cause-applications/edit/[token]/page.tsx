import { prisma } from "@/lib/prisma";
import {
  verifyApplicationEditToken, APPLICANT_EDITABLE_STATUSES, type AttachmentMeta,
} from "@/lib/applications";
import ApplicationForm from "../../ApplicationForm";

// Applicant's personal edit link, copied by an admin from /admin/forms/[id] and
// shared with the applicant to collect missing details / documents. Shows what
// they already entered; saving goes to PUT /api/cause-applications/edit/[token].
// Unlisted + noindex (robots.ts also disallows /cause-applications).
export const metadata = {
  title: "Update your application — MicroCharity",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function EditApplicationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const id = verifyApplicationEditToken(token);
  const app = id ? await prisma.causeApplication.findUnique({ where: { id } }) : null;

  let body: React.ReactNode;
  if (!app) {
    body = <Notice title="This link is not valid.">Please check the link you received, or contact <a className="text-accent-600 font-semibold" href="mailto:info@microcharity.com">info@microcharity.com</a>.</Notice>;
  } else if (!APPLICANT_EDITABLE_STATUSES.includes(app.status)) {
    body = (
      <Notice title="This application can no longer be edited.">
        Application <span className="font-mono">{app.applicationNo}</span> has already been reviewed. If something needs to change, please contact{" "}
        <a className="text-accent-600 font-semibold" href="mailto:info@microcharity.com">info@microcharity.com</a>.
      </Notice>
    );
  } else {
    // Bank details are deliberately included: the applicant entered them and must be
    // able to correct them. The link itself is the credential.
    body = (
      <ApplicationForm
        edit={{
          token,
          applicationNo: app.applicationNo,
          formType: app.formType,
          data: (app.data as Record<string, unknown>) ?? {},
          attachments: ((app.attachmentMeta as AttachmentMeta[] | null) ?? []).map((a) => ({
            field: a.field, url: a.url, filename: a.filename, size: a.size,
          })),
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-soft)]">
      <header className="bg-white border-b border-[var(--color-line)]">
        <div className="container-page py-6">
          <div className="text-[11px] uppercase tracking-wider font-semibold text-accent-600">MicroCharity Trust</div>
          <h1 className="font-display text-2xl md:text-3xl text-ink mt-1">Update your application</h1>
        </div>
      </header>
      <main className="container-page py-8 max-w-3xl">{body}</main>
    </div>
  );
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white border border-[var(--color-line)] p-6 md:p-8">
      <p className="font-display text-lg text-ink mb-2">{title}</p>
      <p className="text-sm text-muted leading-relaxed">{children}</p>
    </div>
  );
}
