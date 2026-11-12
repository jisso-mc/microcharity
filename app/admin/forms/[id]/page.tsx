import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import type { ApplicationStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import {
  FORM_TYPE_LABEL, makeApplicationEditToken, APPLICANT_EDITABLE_STATUSES, type AttachmentMeta,
} from "@/lib/applications";
import { fieldLabel as lbl, sectionLabel, orderedSections, orderedFields, attachmentLabel } from "@/lib/application-fields";
import { setApplicationStatusAction, saveApplicationNotesAction, deleteApplicationAction } from "./actions";
import { PendingButton, CopyLinkButton, BackupPanel } from "./FormControls";

export const metadata = { title: "Application — Admin" };
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<ApplicationStatus, string> = {
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

const STATUS_BADGE: Record<ApplicationStatus, string> = {
  SUBMITTED:    "bg-blue-50 text-blue-700 border-blue-200",
  UNDER_REVIEW: "bg-yellow-50 text-yellow-700 border-yellow-200",
  APPROVED:     "bg-green-50 text-green-700 border-green-200",
  REJECTED:     "bg-[var(--color-soft)] text-muted border-[var(--color-line)]",
};

// Status changes available at any time, in either direction.
const STATUS_ACTIONS: Array<{ status: ApplicationStatus; label: string; pending: string; cls: string }> = [
  { status: "UNDER_REVIEW", label: "Under review", pending: "Saving…",    cls: "border-[var(--color-line)] text-ink hover:border-ink" },
  { status: "APPROVED",     label: "Approve",      pending: "Approving…", cls: "border-green-600 bg-green-600 text-white hover:bg-green-700" },
  { status: "REJECTED",     label: "Reject",       pending: "Rejecting…", cls: "border-accent-600 text-accent-700 hover:bg-accent-50" },
];

export default async function AdminFormDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getCurrentUser();
  const app = await prisma.causeApplication.findUnique({
    where: { id },
    include: { reviewedBy: { select: { name: true, email: true } } },
  });
  if (!app) notFound();

  // Bank account details are sensitive — only ADMIN role sees them; Editors see a
  // redacted placeholder. The full payload is still in the DB; this is a UI gate.
  const isAdmin = me?.role === "ADMIN";
  const fullData = (app.data as Record<string, unknown>) ?? {};
  const data = isAdmin
    ? fullData
    : Object.fromEntries(
        Object.entries(fullData).filter(([k]) => k !== "bankDetails")
      );
  const attachments = (app.attachmentMeta as AttachmentMeta[] | null) ?? [];

  // Applicant's personal edit link — absolute URL on whatever host the admin is using.
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "www.microcharity.com";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const editUrl = `${proto}://${host}/cause-applications/edit/${makeApplicationEditToken(app.id)}`;
  const applicantCanEdit = APPLICANT_EDITABLE_STATUSES.includes(app.status);

  return (
    <div className="space-y-6 max-w-4xl">
      <Link href="/admin/forms" className="text-sm text-muted hover:text-ink inline-block">← Back to forms</Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-ink">{FORM_TYPE_LABEL[app.formType]} application</h1>
          <p className="text-sm text-muted mt-1">
            <span className="font-mono">{app.applicationNo}</span> · Submitted {app.createdAt.toLocaleString("en-IN")}
            {app.updatedAt.getTime() - app.createdAt.getTime() > 60_000 && <> · Last updated {app.updatedAt.toLocaleString("en-IN")}</>}
            {app.reviewedAt && app.reviewedBy && <> · Reviewed by {app.reviewedBy.name} on {app.reviewedAt.toLocaleDateString("en-IN")}</>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-[11px] uppercase tracking-wider font-semibold px-2.5 py-1.5 rounded border ${STATUS_BADGE[app.status]}`}>
            {STATUS_LABEL[app.status]}
          </span>
          {STATUS_ACTIONS.filter((a) => a.status !== app.status).map((a) => (
            <form key={a.status} action={setApplicationStatusAction}>
              <input type="hidden" name="id" value={app.id} />
              <input type="hidden" name="status" value={a.status} />
              <PendingButton
                pendingLabel={a.pending}
                className={`text-xs font-semibold px-3.5 py-1.5 rounded-full border transition disabled:opacity-60 ${a.cls}`}
              >
                {a.label}
              </PendingButton>
            </form>
          ))}
        </div>
      </div>

      {/* Quick header card with applicant identity */}
      <section className="rounded-2xl bg-white border border-[var(--color-line)] p-6">
        <div className="grid sm:grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted">Name</div>
            <div className="font-semibold text-ink mt-0.5">{app.fullName}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-muted">Phone</div>
            <div className="text-ink mt-0.5">{app.phone}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-muted">Email</div>
            <div className="text-ink mt-0.5">{app.email ?? "—"}</div>
          </div>
        </div>
      </section>

      {/* Applicant edit link — lets the applicant reopen their own form to fix details
          and upload missing documents. Works only while Submitted / Under review. */}
      <section className="rounded-2xl bg-white border border-[var(--color-line)] p-6">
        <h2 className="font-display text-lg text-ink mb-1">Applicant link</h2>
        <p className="text-sm text-muted mb-3">
          Share this link with the applicant to collect more details or documents. They&apos;ll see everything they already entered and can edit it and add attachments. You&apos;ll get an email when they save.
        </p>
        <CopyLinkButton url={editUrl} />
        {!applicantCanEdit && (
          <p className="text-xs text-accent-700 mt-2">
            The link is currently closed because this application is {STATUS_LABEL[app.status].toLowerCase()}. Set it back to <strong>Under review</strong> to let the applicant edit again.
          </p>
        )}
      </section>

      {/* Backup PDF — after approval, ADMIN only (contains bank details). */}
      {isAdmin && (
        <section className="rounded-2xl bg-white border border-[var(--color-line)] p-6">
          <h2 className="font-display text-lg text-ink mb-1">Backup PDF</h2>
          {app.status === "APPROVED" ? (
            <>
              <p className="text-sm text-muted mb-3">
                Generates one PDF with the full application followed by the uploaded documents, and emails it with the subject
                <span className="text-ink"> “Application Form - {app.fullName} - {FORM_TYPE_LABEL[app.formType]} - date submitted”</span>.
              </p>
              <BackupPanel id={app.id} defaultEmail={me?.email ?? ""} />
            </>
          ) : (
            <p className="text-sm text-muted">Available once the application is approved.</p>
          )}
        </section>
      )}

      {/* All form sections, rendered from the JSON payload in display order. Read-only. */}
      <div className="space-y-4">
        {orderedSections(data).map(([key, value]) => (
          <DataSection key={key} sectionKey={key} value={value} />
        ))}
      </div>

      {/* Attachments — stored on Vercel Blob; a copy also goes to info@microcharity.com
          on submission. Very old rows (pre-Blob) have no url and live only in that email. */}
      <section className="rounded-2xl bg-white border border-[var(--color-line)] p-6">
        <h2 className="font-display text-lg text-ink mb-3">Attachments</h2>
        {attachments.length === 0 ? (
          <p className="text-sm text-muted">No attachments uploaded. Share the applicant link above to collect them.</p>
        ) : (
          <ul className="text-sm space-y-2">
            {attachments.map((a, i) => (
              <li key={i} className="text-ink flex items-baseline justify-between gap-3">
                <span>
                  <strong>{attachmentLabel(app.formType, a.field)}:</strong> {a.filename}{" "}
                  <span className="text-xs text-muted">({(a.size / 1024).toFixed(0)} KB · {a.mimeType})</span>
                </span>
                {a.url ? (
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noopener"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-accent-700 hover:text-accent-600 whitespace-nowrap"
                  >
                    Open
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17 17 7"/><path d="M7 7h10v10"/></svg>
                  </a>
                ) : (
                  <span className="text-xs text-muted whitespace-nowrap">via email</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Admin notes */}
      <section className="rounded-2xl bg-white border border-[var(--color-line)] p-6">
        <h2 className="font-display text-lg text-ink mb-3">Internal notes</h2>
        <form action={saveApplicationNotesAction} className="space-y-3">
          <input type="hidden" name="id" value={app.id} />
          <textarea
            name="adminNotes"
            defaultValue={app.adminNotes ?? ""}
            rows={5}
            placeholder="Notes for fellow admins. Not shown to the applicant."
            className="w-full rounded-lg border border-[var(--color-line)] focus:border-accent-600 focus:ring-2 focus:ring-accent-100 outline-none px-3 py-2 text-sm bg-white resize-y"
          />
          <PendingButton pendingLabel="Saving…" className="rounded-full bg-accent-600 hover:bg-accent-700 disabled:opacity-60 text-white text-sm font-semibold px-5 py-2 transition">
            Save notes
          </PendingButton>
        </form>
      </section>

      {/* Delete — ADMIN only, permanent (row + uploaded files). */}
      {isAdmin && (
        <section className="rounded-2xl bg-white border border-accent-200 p-6">
          <h2 className="font-display text-lg text-ink mb-1">Delete application</h2>
          <p className="text-sm text-muted mb-3">Permanently removes this application and its uploaded documents. This can&apos;t be undone.</p>
          <form action={deleteApplicationAction}>
            <input type="hidden" name="id" value={app.id} />
            <PendingButton
              pendingLabel="Deleting…"
              confirm={`Permanently delete application ${app.applicationNo} (${app.fullName}) and its documents?`}
              className="rounded-full border border-accent-600 text-accent-700 hover:bg-accent-50 disabled:opacity-60 text-sm font-semibold px-5 py-2 transition"
            >
              Delete application
            </PendingButton>
          </form>
        </section>
      )}
    </div>
  );
}

function DataSection({ sectionKey, value }: { sectionKey: string; value: unknown }) {
  const title = sectionLabel(sectionKey);
  return (
    <section className="rounded-2xl bg-white border border-[var(--color-line)] p-6">
      <h2 className="font-display text-lg text-ink mb-3">{title}</h2>
      <RenderValue value={value} />
    </section>
  );
}

function RenderValue({ value }: { value: unknown }) {
  if (value == null || value === "") return <p className="text-sm text-muted">—</p>;
  if (typeof value === "boolean") return <p className="text-sm text-ink">{value ? "Yes" : "No"}</p>;
  if (typeof value === "number") return <p className="text-sm text-ink">{value}</p>;
  if (typeof value === "string") {
    return (
      <p className="text-sm text-ink whitespace-pre-wrap leading-relaxed">{value}</p>
    );
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <p className="text-sm text-muted">No entries.</p>;
    const cols = orderedFields(Object.fromEntries(
      (value as Array<Record<string, unknown>>).flatMap((r) => Object.keys(r ?? {}).map((k) => [k, 1])),
    )).map(([k]) => k);
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm border border-[var(--color-line)] rounded-lg">
          <thead className="bg-[var(--color-soft)] text-xs uppercase tracking-wider text-muted">
            <tr>{cols.map((c) => <th key={c} className="text-left font-semibold px-3 py-2">{lbl(c)}</th>)}</tr>
          </thead>
          <tbody>
            {(value as Array<Record<string, unknown>>).map((row, i) => (
              <tr key={i} className="border-t border-[var(--color-line)]">
                {cols.map((c) => (
                  <td key={c} className="px-3 py-2 text-ink whitespace-pre-wrap align-top">
                    {row[c] == null || row[c] === "" ? <span className="text-muted">—</span> : String(row[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (typeof value === "object") {
    return (
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
        {orderedFields(value as Record<string, unknown>).map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs uppercase tracking-wider text-muted">{lbl(k)}</dt>
            <dd className="text-ink mt-0.5 whitespace-pre-wrap leading-relaxed">
              {v == null || v === "" ? <span className="text-muted">—</span> : (typeof v === "boolean" ? (v ? "Yes" : "No") : String(v))}
            </dd>
          </div>
        ))}
      </dl>
    );
  }
  return null;
}
