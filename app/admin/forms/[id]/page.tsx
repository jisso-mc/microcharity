import Link from "next/link";
import { notFound } from "next/navigation";
import type { ApplicationStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { FORM_TYPE_LABEL } from "@/lib/applications";
import { setApplicationStatusAction, saveApplicationNotesAction } from "./actions";

export const metadata = { title: "Application — Admin" };
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<ApplicationStatus, string> = {
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

const SECTION_LABELS: Record<string, string> = {
  applicant: "Applicant", organization: "Organization",
  father: "Father's details", mother: "Mother's details",
  course: "Course",
  educationHistory: "Education history",
  fundingRequested: "Funding requested", fundingItems: "Funding items",
  fundingPurpose: "Purpose of funding request",
  family: "Family details",
  annualIncome: "Annual income", medicalCircumstances: "Medical circumstances",
  causeCircumstances: "Cause circumstances", totalAmount: "Total amount required",
  prevAssistance: "Previously received assistance", heardAbout: "Where heard about charity",
  reference: "Reference",
  medicalOfficer: "Medical officer", ngoDeclarant: "NGO / committee declarant",
  bankDetails: "Bank account details",
  acknowledgement: "Acknowledgement (e-signature)",
};

const FIELD_LABELS: Record<string, string> = {
  fullName: "Full name", address: "Address", phone: "Phone", mobile: "Mobile", email: "Email",
  dateOfBirth: "Date of birth", age: "Age", sex: "Sex",
  name: "Name", relationship: "Relationship", occupation: "Occupation",
  contactNumber: "Contact number", contactPerson: "Contact person", contactMobile: "Contact person mobile",
  knownSince: "Known applicant since", description: "Description",
  designation: "Designation", organization: "Organization",
  accountNumber: "A/C number", accountHolderName: "Account holder name", bankName: "Bank",
  branch: "Branch", ifsc: "IFSC code", relationshipIfNotApplicant: "Relationship (if a/c not in applicant's name)",
  title: "Course title", school: "School / Educational establishment",
  fees: "Fees", uniform: "Uniform", books: "Books / stationaries", others: "Others",
  itemName: "Item", nos: "Nos", cost: "Cost",
  fromDate: "From", toDate: "To", achievements: "Achievements",
  fullLegalName: "Full legal name", date: "Date", place: "Place",
  termsAccepted: "T&Cs accepted",
};

function lbl(k: string) { return FIELD_LABELS[k] ?? k; }

export default async function AdminFormDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const app = await prisma.causeApplication.findUnique({
    where: { id },
    include: { reviewedBy: { select: { name: true, email: true } } },
  });
  if (!app) notFound();

  const data = (app.data as Record<string, unknown>) ?? {};
  const attachments = (app.attachmentMeta as Array<{ field: string; filename: string; size: number; mimeType: string }> | null) ?? [];

  return (
    <div className="space-y-6 max-w-4xl">
      <Link href="/admin/forms" className="text-sm text-muted hover:text-ink inline-block">← Back to forms</Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-ink">{FORM_TYPE_LABEL[app.formType]} application</h1>
          <p className="text-sm text-muted mt-1">
            <span className="font-mono">{app.applicationNo}</span> · Submitted {app.createdAt.toLocaleString("en-IN")}
            {app.reviewedAt && app.reviewedBy && <> · Reviewed by {app.reviewedBy.name} on {app.reviewedAt.toLocaleDateString("en-IN")}</>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(["SUBMITTED","UNDER_REVIEW","APPROVED","REJECTED"] as ApplicationStatus[]).map((s) => (
            <form key={s} action={setApplicationStatusAction} className="inline">
              <input type="hidden" name="id" value={app.id} />
              <input type="hidden" name="status" value={s} />
              <button
                type="submit"
                disabled={app.status === s}
                className={`text-xs uppercase tracking-wider font-semibold px-3 py-1.5 rounded-full border transition ${
                  app.status === s
                    ? "bg-ink text-white border-ink"
                    : "border-[var(--color-line)] text-muted hover:border-ink hover:text-ink"
                }`}
              >
                {STATUS_LABEL[s]}
              </button>
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

      {/* All form sections, rendered from the JSON payload. Read-only. */}
      <div className="space-y-4">
        {Object.entries(data).map(([key, value]) => (
          <DataSection key={key} sectionKey={key} value={value} />
        ))}
      </div>

      {/* Attachments — metadata only; the actual files were emailed to info@microcharity.com */}
      <section className="rounded-2xl bg-white border border-[var(--color-line)] p-6">
        <h2 className="font-display text-lg text-ink mb-3">Attachments</h2>
        {attachments.length === 0 ? (
          <p className="text-sm text-muted">No attachments uploaded with this submission. The applicant may have emailed supporting documents separately to info@microcharity.com.</p>
        ) : (
          <>
            <p className="text-xs text-muted mb-3">Files were forwarded once to <strong>info@microcharity.com</strong> on submission. Open that email to access the actual documents.</p>
            <ul className="text-sm space-y-1">
              {attachments.map((a, i) => (
                <li key={i} className="text-ink">
                  <strong>{lbl(a.field)}:</strong> {a.filename}{" "}
                  <span className="text-xs text-muted">({(a.size / 1024).toFixed(0)} KB · {a.mimeType})</span>
                </li>
              ))}
            </ul>
          </>
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
          <button type="submit" className="rounded-full bg-accent-600 hover:bg-accent-700 text-white text-sm font-semibold px-5 py-2 transition">
            Save notes
          </button>
        </form>
      </section>
    </div>
  );
}

function DataSection({ sectionKey, value }: { sectionKey: string; value: unknown }) {
  const title = SECTION_LABELS[sectionKey] ?? sectionKey;
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
    const cols = Array.from((value as Array<Record<string, unknown>>).reduce((s, r) => {
      Object.keys(r ?? {}).forEach((k) => s.add(k)); return s;
    }, new Set<string>()));
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
        {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
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
