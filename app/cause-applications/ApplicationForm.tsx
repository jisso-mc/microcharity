"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type FormType = "EDUCATIONAL" | "MEDICAL" | "INDIVIDUAL" | "ORGANIZATIONAL";

const FORM_LABELS: Record<FormType, string> = {
  EDUCATIONAL:    "Educational",
  MEDICAL:        "Medical",
  INDIVIDUAL:     "Individuals",
  ORGANIZATIONAL: "Organizational",
};

const inputCls =
  "w-full rounded-lg border border-[var(--color-line)] focus:border-accent-600 focus:ring-2 focus:ring-accent-100 outline-none px-3 py-2 text-sm bg-white";

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Fresh empty payload per type. Helper prevents nested fields from being undefined.
function emptyData(type: FormType) {
  const applicant = { fullName: "", address: "", phone: "", mobile: "", email: "", dateOfBirth: "", age: "", sex: "" };
  const reference = { name: "", address: "", phone: "", email: "", knownSince: "", description: "" };
  const bankDetails = { accountNumber: "", accountHolderName: "", bankName: "", branch: "", ifsc: "", relationshipIfNotApplicant: "" };
  const acknowledgement = { fullLegalName: "", date: todayISO(), place: "", termsAccepted: false };
  const familyRow = { name: "", relationship: "", age: "", sex: "", occupation: "", contactNumber: "" };
  if (type === "EDUCATIONAL") {
    return {
      applicant,
      father: { name: "", address: "", phone: "" },
      mother: { name: "", address: "", phone: "" },
      course: { title: "", school: "" },
      educationHistory: [{ school: "", fromDate: "", toDate: "", achievements: "" }],
      fundingRequested: { fees: "", uniform: "", books: "", others: "" },
      totalAmount: "",
      prevAssistance: "",
      heardAbout: "",
      reference,
      bankDetails,
      acknowledgement,
    };
  }
  if (type === "MEDICAL") {
    return {
      applicant,
      family: [{ ...familyRow }],
      annualIncome: "",
      medicalCircumstances: "",
      totalAmount: "",
      prevAssistance: "",
      heardAbout: "",
      reference,
      medicalOfficer: { name: "", designation: "", organization: "", contactNumber: "", email: "" },
      bankDetails,
      acknowledgement,
    };
  }
  if (type === "INDIVIDUAL") {
    return {
      applicant,
      family: [{ ...familyRow }],
      annualIncome: "",
      causeCircumstances: "",
      totalAmount: "",
      prevAssistance: "",
      heardAbout: "",
      reference,
      ngoDeclarant: { name: "", designation: "", organization: "", contactNumber: "", email: "" },
      bankDetails,
      acknowledgement,
    };
  }
  // ORGANIZATIONAL
  return {
    organization: { fullName: "", address: "", phone: "", email: "", contactPerson: "", contactMobile: "" },
    fundingPurpose: "",
    fundingItems: [{ itemName: "", nos: "", cost: "" }],
    totalAmount: "",
    reference,
    bankDetails,
    acknowledgement,
  };
}

export default function ApplicationForm() {
  const router = useRouter();
  const [formType, setFormType] = useState<FormType | "">("");
  // `any` here is pragmatic — the shape varies per formType and is validated server-side.
  // Keeping a typed union would balloon this component for negligible safety win.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [data, setData] = useState<any>({});
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ applicationNo: string } | null>(null);

  function handleTypeChange(next: FormType | "") {
    setFormType(next);
    setData(next ? emptyData(next) : {});
    setFiles({});
    setError(null);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function setSection(key: string, partial: Record<string, any>) {
    setData((d: Record<string, unknown>) => ({ ...d, [key]: { ...(d[key] as object), ...partial } }));
  }
  function setField(key: string, value: unknown) {
    setData((d: Record<string, unknown>) => ({ ...d, [key]: value }));
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function updateArrayItem(arrayKey: string, idx: number, partial: Record<string, any>) {
    setData((d: Record<string, unknown>) => {
      const arr = (d[arrayKey] as Array<Record<string, unknown>>) ?? [];
      return { ...d, [arrayKey]: arr.map((it, i) => (i === idx ? { ...it, ...partial } : it)) };
    });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function addArrayItem(arrayKey: string, blank: Record<string, any>) {
    setData((d: Record<string, unknown>) => {
      const arr = (d[arrayKey] as Array<Record<string, unknown>>) ?? [];
      return { ...d, [arrayKey]: [...arr, blank] };
    });
  }
  function removeArrayItem(arrayKey: string, idx: number) {
    setData((d: Record<string, unknown>) => {
      const arr = (d[arrayKey] as Array<Record<string, unknown>>) ?? [];
      return { ...d, [arrayKey]: arr.filter((_, i) => i !== idx) };
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formType) { setError("Pick an application type."); return; }
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("formType", formType);
      fd.set("payload", JSON.stringify(data));
      for (const [k, f] of Object.entries(files)) if (f) fd.set(k, f);
      const res = await fetch("/api/cause-applications", { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Could not submit.");
      setDone({ applicationNo: j.applicationNo });
      // Scroll to top so the confirmation is visible.
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-2xl bg-white border border-[var(--color-line)] p-6 md:p-8">
        <div className="rounded-lg bg-green-50 border border-green-200 p-4 mb-4">
          <p className="font-display text-base text-green-800">Application received — thank you.</p>
        </div>
        <p className="text-sm text-ink leading-relaxed mb-2">
          Your application number is <strong className="font-mono">{done.applicationNo}</strong>. Please quote this in any future correspondence.
        </p>
        <p className="text-sm text-muted leading-relaxed">
          A copy has been emailed to you (if you provided an email address). Our team will review your application and contact you. If you haven&apos;t already, please email any supporting documents (photo, signed certificates, reference letter) to <a className="text-accent-600 hover:text-accent-700 font-semibold" href="mailto:info@microcharity.com">info@microcharity.com</a> referencing your application number.
        </p>
        <button
          type="button"
          onClick={() => router.refresh()}
          className="mt-6 inline-flex items-center gap-2 rounded-full border border-[var(--color-line)] hover:border-ink text-ink font-semibold px-5 py-2 text-sm transition"
        >
          Submit another application
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {/* Type picker */}
      <section className="rounded-2xl bg-white border border-[var(--color-line)] p-6">
        <Label>Application type *</Label>
        <select
          value={formType}
          onChange={(e) => handleTypeChange(e.target.value as FormType | "")}
          required
          className={`${inputCls} mt-1`}
        >
          <option value="">— select —</option>
          {(Object.keys(FORM_LABELS) as FormType[]).map((t) => (
            <option key={t} value={t}>{FORM_LABELS[t]}</option>
          ))}
        </select>
        <p className="text-xs text-muted mt-2">
          Educational: for individual students seeking school/college fee support. Medical: for patients.
          Individuals: for any other personal need. Organizational: for institutions / NGOs.
        </p>
      </section>

      {formType === "EDUCATIONAL" && (
        <EducationalSections
          data={data}
          setSection={setSection}
          setField={setField}
          updateArrayItem={updateArrayItem}
          addArrayItem={addArrayItem}
          removeArrayItem={removeArrayItem}
        />
      )}
      {formType === "MEDICAL" && (
        <MedicalSections
          data={data}
          setSection={setSection}
          setField={setField}
          updateArrayItem={updateArrayItem}
          addArrayItem={addArrayItem}
          removeArrayItem={removeArrayItem}
        />
      )}
      {formType === "INDIVIDUAL" && (
        <IndividualSections
          data={data}
          setSection={setSection}
          setField={setField}
          updateArrayItem={updateArrayItem}
          addArrayItem={addArrayItem}
          removeArrayItem={removeArrayItem}
        />
      )}
      {formType === "ORGANIZATIONAL" && (
        <OrganizationalSections
          data={data}
          setSection={setSection}
          setField={setField}
          updateArrayItem={updateArrayItem}
          addArrayItem={addArrayItem}
          removeArrayItem={removeArrayItem}
        />
      )}

      {formType && (
        <>
          <ReferenceSection data={data} setSection={setSection} />
          <BankDetailsSection data={data} setSection={setSection} />
          <AttachmentsSection formType={formType} files={files} setFiles={setFiles} />
          <AcknowledgementSection data={data} setSection={setSection} />

          {error && <p className="text-sm text-accent-700 bg-accent-50 border border-accent-200 rounded-lg px-3 py-2">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-accent-600 hover:bg-accent-700 disabled:opacity-60 text-white font-semibold px-6 py-3 transition"
          >
            {busy ? "Submitting…" : "Submit application"}
          </button>
        </>
      )}
    </form>
  );
}

// ---------- Reusable sub-section components ----------

type SectionProps = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setSection: (key: string, partial: Record<string, any>) => void;
  setField: (key: string, value: unknown) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updateArrayItem: (arrayKey: string, idx: number, partial: Record<string, any>) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addArrayItem: (arrayKey: string, blank: Record<string, any>) => void;
  removeArrayItem: (arrayKey: string, idx: number) => void;
};

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white border border-[var(--color-line)] p-6">
      <h2 className="font-display text-lg text-ink mb-4">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-sm font-semibold text-ink">{children}</label>;
}

function Field({
  label, value, onChange, type = "text", required, placeholder, colSpan,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
  colSpan?: boolean;
}) {
  return (
    <div className={colSpan ? "sm:col-span-2" : ""}>
      <Label>{label}{required && <span className="text-accent-600"> *</span>}</Label>
      <input
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        className={`${inputCls} mt-1`}
      />
    </div>
  );
}

function TextArea({
  label, value, onChange, required, rows = 5,
}: { label: string; value: string; onChange: (v: string) => void; required?: boolean; rows?: number }) {
  return (
    <div>
      <Label>{label}{required && <span className="text-accent-600"> *</span>}</Label>
      <textarea
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        rows={rows}
        className={`${inputCls} mt-1 resize-y`}
      />
    </div>
  );
}

function Select({
  label, value, onChange, options, required,
}: { label: string; value: string; onChange: (v: string) => void; options: Array<[string, string]>; required?: boolean }) {
  return (
    <div>
      <Label>{label}{required && <span className="text-accent-600"> *</span>}</Label>
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value)} required={required} className={`${inputCls} mt-1`}>
        <option value="">— select —</option>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}

// ----- Applicant identity (Educational, Medical, Individuals) -----

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ApplicantSection({ data, setSection, label = "Applicant details" }: { data: any; setSection: SectionProps["setSection"]; label?: string }) {
  const a = data.applicant ?? {};
  return (
    <Card title={label}>
      <Field label="Full name" value={a.fullName} onChange={(v) => setSection("applicant", { fullName: v })} required colSpan />
      <Field label="Address" value={a.address} onChange={(v) => setSection("applicant", { address: v })} required colSpan />
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Phone" value={a.phone} onChange={(v) => setSection("applicant", { phone: v })} type="tel" required />
        <Field label="Mobile" value={a.mobile} onChange={(v) => setSection("applicant", { mobile: v })} type="tel" />
        <Field label="Email" value={a.email} onChange={(v) => setSection("applicant", { email: v })} type="email" />
        <Field label="Date of birth" value={a.dateOfBirth} onChange={(v) => setSection("applicant", { dateOfBirth: v })} type="date" required />
        <Field label="Age" value={a.age} onChange={(v) => setSection("applicant", { age: v })} />
        <Select label="Sex" value={a.sex ?? ""} onChange={(v) => setSection("applicant", { sex: v })} options={[["MALE","Male"],["FEMALE","Female"]]} />
      </div>
    </Card>
  );
}

// ----- Educational form sections -----

function EducationalSections(p: SectionProps) {
  const ed = p.data.educationHistory ?? [];
  return (
    <>
      <ApplicantSection data={p.data} setSection={p.setSection} />

      <Card title="Parental details">
        <h3 className="text-sm font-semibold text-muted">Father</h3>
        <Field label="Name" value={p.data.father?.name} onChange={(v) => p.setSection("father", { name: v })} required />
        <Field label="Address" value={p.data.father?.address} onChange={(v) => p.setSection("father", { address: v })} required />
        <Field label="Phone" value={p.data.father?.phone} onChange={(v) => p.setSection("father", { phone: v })} type="tel" required />

        <h3 className="text-sm font-semibold text-muted mt-4">Mother</h3>
        <Field label="Name" value={p.data.mother?.name} onChange={(v) => p.setSection("mother", { name: v })} required />
        <Field label="Address" value={p.data.mother?.address} onChange={(v) => p.setSection("mother", { address: v })} required />
        <Field label="Phone" value={p.data.mother?.phone} onChange={(v) => p.setSection("mother", { phone: v })} type="tel" required />
      </Card>

      <Card title="Course">
        <Field label="Course title" value={p.data.course?.title} onChange={(v) => p.setSection("course", { title: v })} required />
        <Field label="School / Educational establishment" value={p.data.course?.school} onChange={(v) => p.setSection("course", { school: v })} required />
      </Card>

      <Card title="Education history">
        <p className="text-xs text-muted -mt-2">List previous schools / institutions attended.</p>
        {ed.map((row: Record<string, string>, i: number) => (
          <div key={i} className="rounded-lg border border-[var(--color-line)] p-3 space-y-3 bg-[var(--color-soft)]/50">
            <Field label="School / Establishment" value={row.school} onChange={(v) => p.updateArrayItem("educationHistory", i, { school: v })} />
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="From" value={row.fromDate} onChange={(v) => p.updateArrayItem("educationHistory", i, { fromDate: v })} type="date" />
              <Field label="To" value={row.toDate} onChange={(v) => p.updateArrayItem("educationHistory", i, { toDate: v })} type="date" />
            </div>
            <TextArea label="Achievements" value={row.achievements} onChange={(v) => p.updateArrayItem("educationHistory", i, { achievements: v })} rows={2} />
            {ed.length > 1 && (
              <button type="button" onClick={() => p.removeArrayItem("educationHistory", i)} className="text-xs font-semibold text-muted hover:text-accent-700">Remove this row</button>
            )}
          </div>
        ))}
        <button type="button" onClick={() => p.addArrayItem("educationHistory", { school: "", fromDate: "", toDate: "", achievements: "" })} className="text-sm font-semibold text-accent-600 hover:text-accent-700">+ Add row</button>
      </Card>

      <Card title="Funding requested">
        <p className="text-xs text-muted -mt-2">Indicate items and costs (₹).</p>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Fees" value={p.data.fundingRequested?.fees} onChange={(v) => p.setSection("fundingRequested", { fees: v })} />
          <Field label="Uniform" value={p.data.fundingRequested?.uniform} onChange={(v) => p.setSection("fundingRequested", { uniform: v })} />
          <Field label="Books / stationaries" value={p.data.fundingRequested?.books} onChange={(v) => p.setSection("fundingRequested", { books: v })} />
          <Field label="Others" value={p.data.fundingRequested?.others} onChange={(v) => p.setSection("fundingRequested", { others: v })} />
        </div>
        <Field label="Total amount of financial assistance required (₹)" value={p.data.totalAmount} onChange={(v) => p.setField("totalAmount", v)} required />
      </Card>

      <Card title="Background">
        <TextArea label="Have you previously received assistance from any other source? (If yes, state amount, when, and what for.)" value={p.data.prevAssistance} onChange={(v) => p.setField("prevAssistance", v)} rows={3} />
        <TextArea label="Where did you hear about MicroCharity?" value={p.data.heardAbout} onChange={(v) => p.setField("heardAbout", v)} rows={2} />
      </Card>
    </>
  );
}

// ----- Medical -----

function MedicalSections(p: SectionProps) {
  return (
    <>
      <ApplicantSection data={p.data} setSection={p.setSection} label="Patient details" />
      <FamilySection data={p.data} updateArrayItem={p.updateArrayItem} addArrayItem={p.addArrayItem} removeArrayItem={p.removeArrayItem} />
      <Card title="Income">
        <Field label="Annual income of family (₹)" value={p.data.annualIncome} onChange={(v) => p.setField("annualIncome", v)} required />
      </Card>
      <Card title="Medical details">
        <TextArea label="Circumstances leading to the claim — please explain the medical situation in as much detail as possible" value={p.data.medicalCircumstances} onChange={(v) => p.setField("medicalCircumstances", v)} required rows={6} />
        <Field label="Total amount of financial assistance required (₹)" value={p.data.totalAmount} onChange={(v) => p.setField("totalAmount", v)} required />
      </Card>
      <Card title="Background">
        <TextArea label="Have you previously received assistance from any other source? (If yes, state amount, when, and what for.)" value={p.data.prevAssistance} onChange={(v) => p.setField("prevAssistance", v)} rows={3} />
        <TextArea label="Where did you hear about MicroCharity?" value={p.data.heardAbout} onChange={(v) => p.setField("heardAbout", v)} rows={2} />
      </Card>
      <Card title="Certifying medical officer (optional online — signed certificate to be uploaded below or emailed)">
        <p className="text-xs text-muted -mt-2">If you can fill in your treating doctor&apos;s contact details now, do so. The signed certificate (with seal) must be uploaded as an attachment or emailed separately.</p>
        <Field label="Doctor name" value={p.data.medicalOfficer?.name} onChange={(v) => p.setSection("medicalOfficer", { name: v })} />
        <Field label="Designation" value={p.data.medicalOfficer?.designation} onChange={(v) => p.setSection("medicalOfficer", { designation: v })} />
        <Field label="Hospital / Organization" value={p.data.medicalOfficer?.organization} onChange={(v) => p.setSection("medicalOfficer", { organization: v })} />
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Contact number" value={p.data.medicalOfficer?.contactNumber} onChange={(v) => p.setSection("medicalOfficer", { contactNumber: v })} type="tel" />
          <Field label="Email" value={p.data.medicalOfficer?.email} onChange={(v) => p.setSection("medicalOfficer", { email: v })} type="email" />
        </div>
      </Card>
    </>
  );
}

// ----- Individuals -----

function IndividualSections(p: SectionProps) {
  return (
    <>
      <ApplicantSection data={p.data} setSection={p.setSection} />
      <FamilySection data={p.data} updateArrayItem={p.updateArrayItem} addArrayItem={p.addArrayItem} removeArrayItem={p.removeArrayItem} />
      <Card title="Income">
        <Field label="Annual income of family (₹)" value={p.data.annualIncome} onChange={(v) => p.setField("annualIncome", v)} required />
      </Card>
      <Card title="Cause details">
        <TextArea label="Circumstances leading to the claim — explain the family situation and exact need for support" value={p.data.causeCircumstances} onChange={(v) => p.setField("causeCircumstances", v)} required rows={6} />
        <Field label="Total amount of financial assistance required (₹)" value={p.data.totalAmount} onChange={(v) => p.setField("totalAmount", v)} required />
      </Card>
      <Card title="Background">
        <TextArea label="Have you previously received assistance from any other source? (If yes, state amount, when, and what for.)" value={p.data.prevAssistance} onChange={(v) => p.setField("prevAssistance", v)} rows={3} />
        <TextArea label="Where did you hear about MicroCharity?" value={p.data.heardAbout} onChange={(v) => p.setField("heardAbout", v)} rows={2} />
      </Card>
      <Card title="Local NGO / committee declarant (only if applicable)">
        <p className="text-xs text-muted -mt-2">Optional. Only fill in if a local NGO, committee, or known individual is supporting your application. Their signed declaration should be uploaded as an attachment or emailed separately.</p>
        <Field label="Name" value={p.data.ngoDeclarant?.name} onChange={(v) => p.setSection("ngoDeclarant", { name: v })} />
        <Field label="Designation" value={p.data.ngoDeclarant?.designation} onChange={(v) => p.setSection("ngoDeclarant", { designation: v })} />
        <Field label="Organization" value={p.data.ngoDeclarant?.organization} onChange={(v) => p.setSection("ngoDeclarant", { organization: v })} />
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Contact number" value={p.data.ngoDeclarant?.contactNumber} onChange={(v) => p.setSection("ngoDeclarant", { contactNumber: v })} type="tel" />
          <Field label="Email" value={p.data.ngoDeclarant?.email} onChange={(v) => p.setSection("ngoDeclarant", { email: v })} type="email" />
        </div>
      </Card>
    </>
  );
}

// ----- Organizational -----

function OrganizationalSections(p: SectionProps) {
  const items = p.data.fundingItems ?? [];
  return (
    <>
      <Card title="Organization details">
        <Field label="Organization full name" value={p.data.organization?.fullName} onChange={(v) => p.setSection("organization", { fullName: v })} required colSpan />
        <Field label="Address" value={p.data.organization?.address} onChange={(v) => p.setSection("organization", { address: v })} required colSpan />
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Phone" value={p.data.organization?.phone} onChange={(v) => p.setSection("organization", { phone: v })} type="tel" required />
          <Field label="Email" value={p.data.organization?.email} onChange={(v) => p.setSection("organization", { email: v })} type="email" />
          <Field label="Contact person name" value={p.data.organization?.contactPerson} onChange={(v) => p.setSection("organization", { contactPerson: v })} required />
          <Field label="Contact person mobile" value={p.data.organization?.contactMobile} onChange={(v) => p.setSection("organization", { contactMobile: v })} type="tel" required />
        </div>
      </Card>

      <Card title="Funding request">
        <TextArea label="Purpose of funding request (include who will benefit and how)" value={p.data.fundingPurpose} onChange={(v) => p.setField("fundingPurpose", v)} required rows={6} />
        <p className="text-xs text-muted">Itemise the funding request below.</p>
        <div className="space-y-2">
          {items.map((it: Record<string, string>, i: number) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-end">
              <div className="col-span-6"><Field label={i === 0 ? "Item" : ""} value={it.itemName} onChange={(v) => p.updateArrayItem("fundingItems", i, { itemName: v })} /></div>
              <div className="col-span-2"><Field label={i === 0 ? "Nos" : ""} value={it.nos} onChange={(v) => p.updateArrayItem("fundingItems", i, { nos: v })} /></div>
              <div className="col-span-3"><Field label={i === 0 ? "Cost (₹)" : ""} value={it.cost} onChange={(v) => p.updateArrayItem("fundingItems", i, { cost: v })} /></div>
              <div className="col-span-1">
                {items.length > 1 && (
                  <button type="button" onClick={() => p.removeArrayItem("fundingItems", i)} className="w-full text-xs text-muted hover:text-accent-700 py-2">×</button>
                )}
              </div>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => p.addArrayItem("fundingItems", { itemName: "", nos: "", cost: "" })} className="text-sm font-semibold text-accent-600 hover:text-accent-700">+ Add item</button>
        <Field label="Total amount of financial assistance required (₹)" value={p.data.totalAmount} onChange={(v) => p.setField("totalAmount", v)} required />
      </Card>
    </>
  );
}

// ----- Family details (Medical, Individuals) -----

function FamilySection({
  data, updateArrayItem, addArrayItem, removeArrayItem,
}: Pick<SectionProps, "data" | "updateArrayItem" | "addArrayItem" | "removeArrayItem">) {
  const family = data.family ?? [];
  return (
    <Card title="Family details">
      <p className="text-xs text-muted -mt-2">List family members living with the applicant.</p>
      {family.map((row: Record<string, string>, i: number) => (
        <div key={i} className="rounded-lg border border-[var(--color-line)] p-3 space-y-3 bg-[var(--color-soft)]/50">
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Name" value={row.name} onChange={(v) => updateArrayItem("family", i, { name: v })} />
            <Field label="Relationship" value={row.relationship} onChange={(v) => updateArrayItem("family", i, { relationship: v })} />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Age" value={row.age} onChange={(v) => updateArrayItem("family", i, { age: v })} />
            <Select label="Sex" value={row.sex ?? ""} onChange={(v) => updateArrayItem("family", i, { sex: v })} options={[["MALE","Male"],["FEMALE","Female"]]} />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Occupation" value={row.occupation} onChange={(v) => updateArrayItem("family", i, { occupation: v })} />
            <Field label="Contact (mobile)" value={row.contactNumber} onChange={(v) => updateArrayItem("family", i, { contactNumber: v })} type="tel" />
          </div>
          {family.length > 1 && (
            <button type="button" onClick={() => removeArrayItem("family", i)} className="text-xs font-semibold text-muted hover:text-accent-700">Remove this member</button>
          )}
        </div>
      ))}
      <button type="button" onClick={() => addArrayItem("family", { name: "", relationship: "", age: "", sex: "", occupation: "", contactNumber: "" })} className="text-sm font-semibold text-accent-600 hover:text-accent-700">+ Add member</button>
    </Card>
  );
}

// ----- Reference (shared) -----

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ReferenceSection({ data, setSection }: { data: any; setSection: SectionProps["setSection"] }) {
  const r = data.reference ?? {};
  return (
    <Card title="Reference">
      <p className="text-xs text-muted -mt-2">A reference is required in support of your application. The reference letter should be uploaded as an attachment or emailed separately.</p>
      <Field label="Name" value={r.name} onChange={(v) => setSection("reference", { name: v })} required />
      <Field label="Address" value={r.address} onChange={(v) => setSection("reference", { address: v })} required />
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Phone" value={r.phone} onChange={(v) => setSection("reference", { phone: v })} type="tel" required />
        <Field label="Email" value={r.email} onChange={(v) => setSection("reference", { email: v })} type="email" />
      </div>
      <Field label="Known applicant since" value={r.knownSince} onChange={(v) => setSection("reference", { knownSince: v })} required />
      <TextArea label="How is the applicant known to you?" value={r.description} onChange={(v) => setSection("reference", { description: v })} required rows={3} />
    </Card>
  );
}

// ----- Bank details (shared) -----

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function BankDetailsSection({ data, setSection }: { data: any; setSection: SectionProps["setSection"] }) {
  const b = data.bankDetails ?? {};
  return (
    <Card title="Bank account details">
      <p className="text-xs text-muted -mt-2">These details will be used to disburse the funds once the fundraising is completed. The account should be in the name of the applicant, parent/guardian, hospital, school, or organization (depending on the type).</p>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="A/C number" value={b.accountNumber} onChange={(v) => setSection("bankDetails", { accountNumber: v })} required />
        <Field label="Account holder name" value={b.accountHolderName} onChange={(v) => setSection("bankDetails", { accountHolderName: v })} required />
        <Field label="Bank name" value={b.bankName} onChange={(v) => setSection("bankDetails", { bankName: v })} required />
        <Field label="Branch" value={b.branch} onChange={(v) => setSection("bankDetails", { branch: v })} required />
        <Field label="IFSC code" value={b.ifsc} onChange={(v) => setSection("bankDetails", { ifsc: v })} required />
        <Field label="If account is not in applicant's name, specify relationship" value={b.relationshipIfNotApplicant} onChange={(v) => setSection("bankDetails", { relationshipIfNotApplicant: v })} />
      </div>
    </Card>
  );
}

// ----- Attachments -----

function AttachmentsSection({
  formType, files, setFiles,
}: { formType: FormType; files: Record<string, File | null>; setFiles: (next: Record<string, File | null>) => void }) {
  // Slot list per form type
  const slots: Array<{ key: string; label: string; help: string; accept: string }> = [];
  if (formType !== "ORGANIZATIONAL") {
    slots.push({ key: "photo", label: "Photo", help: "Recent photograph of the applicant. JPG/PNG, up to 5 MB.", accept: "image/jpeg,image/png,image/webp" });
  }
  if (formType === "MEDICAL") {
    slots.push({ key: "medicalCertificate", label: "Doctor's signed certificate (with seal)", help: "PDF or image, up to 8 MB.", accept: "application/pdf,image/jpeg,image/png" });
  }
  if (formType === "INDIVIDUAL") {
    slots.push({ key: "ngoDeclaration", label: "Local NGO / committee declaration (optional)", help: "PDF or image, up to 8 MB.", accept: "application/pdf,image/jpeg,image/png" });
  }
  slots.push({ key: "referenceLetter", label: "Reference letter", help: "PDF or image, up to 8 MB.", accept: "application/pdf,image/jpeg,image/png" });

  return (
    <Card title="Attachments">
      <p className="text-xs text-muted -mt-2">
        Upload any supporting documents you have ready. Anything you can&apos;t upload here can be emailed to <strong className="text-ink">info@microcharity.com</strong> referencing your application number after submission. Combined upload size: 20 MB max.
      </p>
      {slots.map((slot) => (
        <div key={slot.key}>
          <Label>{slot.label}</Label>
          <input
            type="file"
            accept={slot.accept}
            onChange={(e) => setFiles({ ...files, [slot.key]: e.target.files?.[0] ?? null })}
            className="block mt-1 text-sm text-ink file:mr-3 file:rounded-md file:border file:border-[var(--color-line)] file:bg-[var(--color-soft)] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-ink hover:file:border-ink"
          />
          <p className="text-xs text-muted mt-1">{slot.help}</p>
        </div>
      ))}
    </Card>
  );
}

// ----- Acknowledgement / e-signature -----

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function AcknowledgementSection({ data, setSection }: { data: any; setSection: SectionProps["setSection"] }) {
  const a = data.acknowledgement ?? {};
  return (
    <Card title="Acknowledgement">
      <p className="text-xs text-muted -mt-2">By submitting, you acknowledge that the information provided is true and that you accept MicroCharity&apos;s Terms and Conditions.</p>
      <Field label="Full legal name (electronic signature)" value={a.fullLegalName} onChange={(v) => setSection("acknowledgement", { fullLegalName: v })} required colSpan />
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Date" value={a.date} onChange={(v) => setSection("acknowledgement", { date: v })} type="date" required />
        <Field label="Place" value={a.place} onChange={(v) => setSection("acknowledgement", { place: v })} required />
      </div>
      <label className="flex items-start gap-3 cursor-pointer pt-1">
        <input
          type="checkbox"
          checked={a.termsAccepted ?? false}
          onChange={(e) => setSection("acknowledgement", { termsAccepted: e.target.checked })}
          required
          className="mt-1 accent-accent-600"
        />
        <span className="text-sm text-ink leading-relaxed">
          I confirm that the information I have provided is true and accurate to the best of my knowledge, and I accept the MicroCharity Terms and Conditions.
        </span>
      </label>
    </Card>
  );
}
