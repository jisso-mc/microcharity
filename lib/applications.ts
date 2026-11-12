// Cause-application form types, validation, and helpers (server-side).
//
// Four form types map to distinct payload shapes (see `*Data` types below).
// All shapes also carry the same identity / situation / reference / bank /
// acknowledgement blocks.
//
// Attachments are uploaded by the browser straight to Vercel Blob (see
// /api/cause-applications/upload) and the submission carries only their URLs.
// verifyAttachments() re-checks every new URL against Blob (path, size, type)
// before it is stored in `attachmentMeta`. Slot definitions + labels are in
// lib/application-fields.ts (client-safe).
//
// Applicant edit links are HMAC-signed tokens over the application id — see
// makeApplicationEditToken().

import crypto from "node:crypto";
import { head } from "@vercel/blob";
import type { Prisma, ApplicationFormType } from "@prisma/client";
import {
  attachmentSlots, attachmentLabel, OTHER_FIELDS, ATTACHMENT_MAX_BYTES, IMAGE_TYPES, DOC_TYPES,
  type AttachmentField,
} from "./application-fields";

export const FORM_TYPE_LABEL: Record<ApplicationFormType, string> = {
  EDUCATIONAL:    "Educational",
  MEDICAL:        "Medical",
  INDIVIDUAL:     "Individuals",
  ORGANIZATIONAL: "Organizational",
};

export const FORM_TYPE_CODE: Record<ApplicationFormType, string> = {
  EDUCATIONAL:    "EDU",
  MEDICAL:        "MED",
  INDIVIDUAL:     "IND",
  ORGANIZATIONAL: "ORG",
};

// ---------- Indian financial year shorthand (matches lib/mcid.ts) ----------

export function fyShort(date = new Date()): string {
  const m = date.getMonth();
  const y = date.getFullYear();
  const start = m >= 3 ? y : y - 1;
  return `${String(start).slice(-2)}-${String(start + 1).slice(-2)}`;
}

/**
 * Allocate the next application number for the given form type within the FY containing
 * `forDate`. Format: "MC/{TYPE_CODE}/{FY}/{SEQ}" e.g. "MC/EDU/26-27/001".
 *
 * Race-safety: must run inside the same transaction as the row that uses the returned
 * number; the @@unique on applicationNo catches concurrent collisions (caller can retry).
 */
export async function nextApplicationNo(
  tx: Prisma.TransactionClient,
  formType: ApplicationFormType,
  forDate = new Date()
): Promise<string> {
  const fy = fyShort(forDate);
  const code = FORM_TYPE_CODE[formType];
  const prefix = `MC/${code}/${fy}/`;
  const existing = await tx.causeApplication.findMany({
    where: { applicationNo: { startsWith: prefix } },
    select: { applicationNo: true },
  });
  let max = 0;
  const re = /\/(\d+)$/;
  for (const e of existing) {
    const m = e.applicationNo.match(re);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  const seq = String(max + 1).padStart(3, "0");
  return `${prefix}${seq}`;
}

// ---------- Shared sub-shapes ----------

export type IndividualApplicant = {
  fullName: string;
  address: string;
  phone: string;
  mobile?: string;
  email?: string;
  dateOfBirth: string; // ISO yyyy-mm-dd
  age?: string;
  sex?: "MALE" | "FEMALE";
};

export type Parent = {
  name: string;
  address: string;
  phone: string;
};

export type FamilyMember = {
  name: string;
  relationship: string;
  age: string;
  sex: "MALE" | "FEMALE" | "";
  occupation: string;
  contactNumber: string;
};

export type EducationHistoryEntry = {
  school: string;
  fromDate: string;
  toDate: string;
  achievements: string;
};

export type FundingItem = {
  itemName: string;
  nos: string;
  cost: string;
};

export type Reference = {
  name: string;
  address: string;
  phone: string;
  email?: string;
  knownSince: string;
  description: string;
};

export type BankDetails = {
  accountNumber: string;
  accountHolderName: string;
  bankName: string;
  branch: string;
  ifsc: string;
  relationshipIfNotApplicant?: string;
};

export type ThirdPartyDeclarant = {
  name: string;
  designation: string;
  organization?: string;
  contactNumber: string;
  email?: string;
};

export type Acknowledgement = {
  fullLegalName: string;
  date: string;        // ISO yyyy-mm-dd
  place: string;
  termsAccepted: boolean;
};

export type AttachmentMeta = {
  field: AttachmentField;
  filename: string;
  size: number;
  mimeType: string;
  // Vercel Blob URL. Very old rows (pre-Blob integration) won't have one — those
  // files only exist in the admin notification email.
  url?: string;
};

// ---------- Per-form-type payloads ----------

export type EducationalData = {
  applicant: IndividualApplicant;
  situation: string;
  father: Parent;
  mother: Parent;
  course: { title: string; school: string };
  educationHistory: EducationHistoryEntry[];
  fundingRequested: { fees?: string; uniform?: string; books?: string; others?: string };
  totalAmount: string;
  prevAssistance?: string;
  heardAbout?: string;
  reference: Reference;
  bankDetails: BankDetails;
  acknowledgement: Acknowledgement;
};

export type MedicalData = {
  applicant: IndividualApplicant;
  situation: string;
  family: FamilyMember[];
  annualIncome: string;
  medicalCircumstances: string;
  totalAmount: string;
  prevAssistance?: string;
  heardAbout?: string;
  reference: Reference;
  medicalOfficer?: ThirdPartyDeclarant;
  bankDetails: BankDetails;
  acknowledgement: Acknowledgement;
};

export type IndividualData = {
  applicant: IndividualApplicant;
  situation: string;
  family: FamilyMember[];
  annualIncome: string;
  causeCircumstances: string;
  totalAmount: string;
  prevAssistance?: string;
  heardAbout?: string;
  reference: Reference;
  ngoDeclarant?: ThirdPartyDeclarant;
  bankDetails: BankDetails;
  acknowledgement: Acknowledgement;
};

export type OrganizationalData = {
  organization: {
    fullName: string;
    address: string;
    phone: string;
    email?: string;
    contactPerson: string;
    contactMobile: string;
  };
  situation: string;
  fundingPurpose: string;
  fundingItems: FundingItem[];
  totalAmount: string;
  reference: Reference;
  bankDetails: BankDetails;
  acknowledgement: Acknowledgement;
};

export type AnyApplicationData =
  | { formType: "EDUCATIONAL";    data: EducationalData }
  | { formType: "MEDICAL";        data: MedicalData }
  | { formType: "INDIVIDUAL";     data: IndividualData }
  | { formType: "ORGANIZATIONAL"; data: OrganizationalData };

// ---------- Validation ----------

const PHONE_RE = /^[+0-9()\s-]{6,20}$/;
const EMAIL_RE = /^\S+@\S+\.\S+$/;

function reqStr(v: unknown, label: string, errs: string[]): string {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) errs.push(`${label} is required.`);
  return s;
}

function optStr(v: unknown): string | undefined {
  const s = typeof v === "string" ? v.trim() : "";
  return s || undefined;
}

function validateApplicant(a: unknown, errs: string[]): IndividualApplicant {
  const o = (a ?? {}) as Record<string, unknown>;
  const fullName    = reqStr(o.fullName, "Full name", errs);
  const address     = reqStr(o.address, "Address", errs);
  const phone       = reqStr(o.phone, "Phone", errs);
  const dateOfBirth = reqStr(o.dateOfBirth, "Date of birth", errs);
  const email       = optStr(o.email);
  if (phone && !PHONE_RE.test(phone)) errs.push("Phone is not a valid number.");
  if (email && !EMAIL_RE.test(email)) errs.push("Email is not valid.");
  const sex = o.sex === "MALE" || o.sex === "FEMALE" ? o.sex : undefined;
  return {
    fullName, address, phone, dateOfBirth,
    mobile: optStr(o.mobile), email, age: optStr(o.age), sex,
  };
}

function validateReference(r: unknown, errs: string[]): Reference {
  const o = (r ?? {}) as Record<string, unknown>;
  return {
    name:        reqStr(o.name, "Reference name", errs),
    address:     reqStr(o.address, "Reference address", errs),
    phone:       reqStr(o.phone, "Reference phone", errs),
    email:       optStr(o.email),
    knownSince:  reqStr(o.knownSince, "Reference: known applicant since", errs),
    description: reqStr(o.description, "Reference: description", errs),
  };
}

function validateBank(b: unknown, errs: string[]): BankDetails {
  const o = (b ?? {}) as Record<string, unknown>;
  return {
    accountNumber:      reqStr(o.accountNumber, "Bank A/C number", errs),
    accountHolderName:  reqStr(o.accountHolderName, "Bank account holder name", errs),
    bankName:           reqStr(o.bankName, "Bank name", errs),
    branch:             reqStr(o.branch, "Bank branch", errs),
    ifsc:               reqStr(o.ifsc, "IFSC code", errs),
    relationshipIfNotApplicant: optStr(o.relationshipIfNotApplicant),
  };
}

function validateAcknowledgement(a: unknown, errs: string[]): Acknowledgement {
  const o = (a ?? {}) as Record<string, unknown>;
  const fullLegalName = reqStr(o.fullLegalName, "Full legal name (e-signature)", errs);
  const date = reqStr(o.date, "Acknowledgement date", errs);
  const place = reqStr(o.place, "Acknowledgement place", errs);
  const termsAccepted = o.termsAccepted === true;
  if (!termsAccepted) errs.push("You must accept the Terms and Conditions to submit.");
  return { fullLegalName, date, place, termsAccepted };
}

function validateThirdParty(t: unknown): ThirdPartyDeclarant | undefined {
  if (!t || typeof t !== "object") return undefined;
  const o = t as Record<string, unknown>;
  // All optional — skip if name is blank.
  const name = optStr(o.name);
  if (!name) return undefined;
  return {
    name,
    designation:   optStr(o.designation) ?? "",
    organization:  optStr(o.organization),
    contactNumber: optStr(o.contactNumber) ?? "",
    email:         optStr(o.email),
  };
}

function validateFamily(f: unknown, errs: string[]): FamilyMember[] {
  if (!Array.isArray(f)) return [];
  const out: FamilyMember[] = [];
  for (const row of f) {
    const o = (row ?? {}) as Record<string, unknown>;
    const name = optStr(o.name);
    if (!name) continue; // skip blank rows
    out.push({
      name,
      relationship:  optStr(o.relationship) ?? "",
      age:           optStr(o.age) ?? "",
      sex:           o.sex === "MALE" || o.sex === "FEMALE" ? o.sex : "",
      occupation:    optStr(o.occupation) ?? "",
      contactNumber: optStr(o.contactNumber) ?? "",
    });
  }
  if (out.length === 0) errs.push("At least one family member is required.");
  return out;
}

/** Validate a submission. Returns the typed payload or a list of errors. */
export function validateSubmission(
  formType: ApplicationFormType,
  raw: unknown
): { ok: true; data: object; fullName: string; phone: string; email: string | null } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const r = (raw ?? {}) as Record<string, unknown>;

  let fullName = "";
  let phone = "";
  let email: string | null = null;
  let result: object;
  const situation = reqStr(r.situation, "Explain the situation leading to help request", errors);

  if (formType === "EDUCATIONAL") {
    const applicant = validateApplicant(r.applicant, errors);
    const father = (() => {
      const o = (r.father ?? {}) as Record<string, unknown>;
      return {
        name:    reqStr(o.name, "Father's name", errors),
        address: reqStr(o.address, "Father's address", errors),
        phone:   reqStr(o.phone, "Father's phone", errors),
      };
    })();
    const mother = (() => {
      const o = (r.mother ?? {}) as Record<string, unknown>;
      return {
        name:    reqStr(o.name, "Mother's name", errors),
        address: reqStr(o.address, "Mother's address", errors),
        phone:   reqStr(o.phone, "Mother's phone", errors),
      };
    })();
    const courseRaw = (r.course ?? {}) as Record<string, unknown>;
    const course = {
      title:  reqStr(courseRaw.title, "Course title", errors),
      school: reqStr(courseRaw.school, "School / Educational establishment", errors),
    };
    const educationHistory: EducationHistoryEntry[] = Array.isArray(r.educationHistory)
      ? r.educationHistory
        .map((row) => {
          const o = (row ?? {}) as Record<string, unknown>;
          return {
            school:       optStr(o.school) ?? "",
            fromDate:     optStr(o.fromDate) ?? "",
            toDate:       optStr(o.toDate) ?? "",
            achievements: optStr(o.achievements) ?? "",
          };
        })
        .filter((e) => e.school)
      : [];
    const fundRaw = (r.fundingRequested ?? {}) as Record<string, unknown>;
    const fundingRequested = {
      fees:    optStr(fundRaw.fees),
      uniform: optStr(fundRaw.uniform),
      books:   optStr(fundRaw.books),
      others:  optStr(fundRaw.others),
    };
    const totalAmount = reqStr(r.totalAmount, "Total amount of financial assistance required", errors);
    const reference = validateReference(r.reference, errors);
    const bankDetails = validateBank(r.bankDetails, errors);
    const acknowledgement = validateAcknowledgement(r.acknowledgement, errors);
    fullName = applicant.fullName;
    phone = applicant.phone;
    email = applicant.email ?? null;
    result = {
      applicant, situation, father, mother, course, educationHistory, fundingRequested, totalAmount,
      prevAssistance: optStr(r.prevAssistance), heardAbout: optStr(r.heardAbout),
      reference, bankDetails, acknowledgement,
    } satisfies EducationalData;
  } else if (formType === "MEDICAL") {
    const applicant = validateApplicant(r.applicant, errors);
    const family = validateFamily(r.family, errors);
    const annualIncome = reqStr(r.annualIncome, "Annual income", errors);
    const medicalCircumstances = reqStr(r.medicalCircumstances, "Medical circumstances", errors);
    const totalAmount = reqStr(r.totalAmount, "Total amount of financial assistance required", errors);
    const reference = validateReference(r.reference, errors);
    const medicalOfficer = validateThirdParty(r.medicalOfficer);
    const bankDetails = validateBank(r.bankDetails, errors);
    const acknowledgement = validateAcknowledgement(r.acknowledgement, errors);
    fullName = applicant.fullName;
    phone = applicant.phone;
    email = applicant.email ?? null;
    result = {
      applicant, situation, family, annualIncome, medicalCircumstances, totalAmount,
      prevAssistance: optStr(r.prevAssistance), heardAbout: optStr(r.heardAbout),
      reference, medicalOfficer, bankDetails, acknowledgement,
    } satisfies MedicalData;
  } else if (formType === "INDIVIDUAL") {
    const applicant = validateApplicant(r.applicant, errors);
    const family = validateFamily(r.family, errors);
    const annualIncome = reqStr(r.annualIncome, "Annual income", errors);
    const causeCircumstances = reqStr(r.causeCircumstances, "Cause circumstances", errors);
    const totalAmount = reqStr(r.totalAmount, "Total amount of financial assistance required", errors);
    const reference = validateReference(r.reference, errors);
    const ngoDeclarant = validateThirdParty(r.ngoDeclarant);
    const bankDetails = validateBank(r.bankDetails, errors);
    const acknowledgement = validateAcknowledgement(r.acknowledgement, errors);
    fullName = applicant.fullName;
    phone = applicant.phone;
    email = applicant.email ?? null;
    result = {
      applicant, situation, family, annualIncome, causeCircumstances, totalAmount,
      prevAssistance: optStr(r.prevAssistance), heardAbout: optStr(r.heardAbout),
      reference, ngoDeclarant, bankDetails, acknowledgement,
    } satisfies IndividualData;
  } else {
    // ORGANIZATIONAL
    const orgRaw = (r.organization ?? {}) as Record<string, unknown>;
    const organization = {
      fullName:      reqStr(orgRaw.fullName, "Organization name", errors),
      address:       reqStr(orgRaw.address, "Organization address", errors),
      phone:         reqStr(orgRaw.phone, "Organization phone", errors),
      email:         optStr(orgRaw.email),
      contactPerson: reqStr(orgRaw.contactPerson, "Contact person name", errors),
      contactMobile: reqStr(orgRaw.contactMobile, "Contact person mobile", errors),
    };
    const fundingPurpose = reqStr(r.fundingPurpose, "Funding purpose", errors);
    const fundingItems: FundingItem[] = Array.isArray(r.fundingItems)
      ? r.fundingItems
        .map((row) => {
          const o = (row ?? {}) as Record<string, unknown>;
          return {
            itemName: optStr(o.itemName) ?? "",
            nos:      optStr(o.nos) ?? "",
            cost:     optStr(o.cost) ?? "",
          };
        })
        .filter((it) => it.itemName)
      : [];
    if (fundingItems.length === 0) errors.push("At least one funding item is required.");
    const totalAmount = reqStr(r.totalAmount, "Total amount", errors);
    const reference = validateReference(r.reference, errors);
    const bankDetails = validateBank(r.bankDetails, errors);
    const acknowledgement = validateAcknowledgement(r.acknowledgement, errors);
    fullName = organization.contactPerson || organization.fullName;
    phone = organization.contactMobile;
    email = organization.email ?? null;
    result = {
      organization, situation, fundingPurpose, fundingItems, totalAmount,
      reference, bankDetails, acknowledgement,
    } satisfies OrganizationalData;
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, data: result, fullName, phone, email };
}

// ---------- Attachments ----------

export type AttachmentInput = { field: string; url: string; filename: string };

const BLOB_HOST_RE = /\.public\.blob\.vercel-storage\.com$/;

/**
 * Validate the attachment list sent with a submission / applicant edit.
 *
 *  - only slots that exist for this form type (+ up to 3 "other" slots), each once
 *  - URLs already on the stored application (`existing`) are trusted as-is, so an
 *    applicant editing an older application isn't blocked by the new 2 MB cap
 *  - every NEW URL is checked against Vercel Blob with head(): it must be one of our
 *    blobs under applications/, at most 2 MB, of an allowed type — never trust the
 *    client-reported size / type
 *  - required slots must be present
 */
export async function verifyAttachments(
  formType: ApplicationFormType,
  raw: unknown,
  existing: AttachmentMeta[] = [],
): Promise<{ ok: true; meta: AttachmentMeta[] } | { ok: false; error: string }> {
  const list = Array.isArray(raw) ? (raw as AttachmentInput[]) : [];
  const slots = attachmentSlots(formType);
  const allowed = new Set<string>([...slots.map((sl) => sl.field), ...OTHER_FIELDS]);
  const existingByUrl = new Map(existing.filter((e) => e.url).map((e) => [e.url!, e]));
  const seen = new Set<string>();
  const out: AttachmentMeta[] = [];

  for (const a of list) {
    const field = String(a?.field ?? "");
    const url = String(a?.url ?? "");
    if (!allowed.has(field)) return { ok: false, error: `Unknown attachment slot: ${field}.` };
    if (seen.has(field)) return { ok: false, error: `Duplicate attachment for ${attachmentLabel(formType, field)}.` };
    seen.add(field);

    const prev = existingByUrl.get(url);
    if (prev) { out.push({ ...prev, field: field as AttachmentField }); continue; }

    const label = attachmentLabel(formType, field);
    let parsed: URL;
    try { parsed = new URL(url); } catch { return { ok: false, error: `${label}: invalid upload.` }; }
    if (parsed.protocol !== "https:" || !BLOB_HOST_RE.test(parsed.hostname) || !parsed.pathname.startsWith("/applications/")) {
      return { ok: false, error: `${label}: invalid upload.` };
    }
    let info: Awaited<ReturnType<typeof head>>;
    try { info = await head(url); } catch { return { ok: false, error: `${label}: upload not found — please upload it again.` }; }
    const imagesOnly = slots.find((sl) => sl.field === field)?.imagesOnly;
    if (info.size > ATTACHMENT_MAX_BYTES) return { ok: false, error: `${label} is larger than 2 MB.` };
    if (!(imagesOnly ? IMAGE_TYPES : DOC_TYPES).includes(info.contentType)) {
      return { ok: false, error: `${label}: file type ${info.contentType} is not allowed.` };
    }
    out.push({
      field: field as AttachmentField,
      filename: String(a.filename ?? "").slice(0, 200) || info.pathname.split("/").pop() || "file",
      size: info.size,
      mimeType: info.contentType,
      url: info.url,
    });
  }

  const missing = slots.filter((sl) => sl.required && !seen.has(sl.field)).map((sl) => sl.label);
  if (missing.length) return { ok: false, error: `Please upload: ${missing.join("; ")}.` };
  return { ok: true, meta: out };
}

// ---------- Applicant edit link ----------
//
// Token = "<applicationId>.<hmac>" signed with ADMIN_SESSION_SECRET (the same secret
// the unsubscribe tokens use). Stateless — no schema column — and deleting the
// application kills the link. Only SUBMITTED / UNDER_REVIEW applications accept edits.

function editSecret(): string {
  const s = process.env.ADMIN_SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("ADMIN_SESSION_SECRET must be set to a string of 32+ characters.");
  return s;
}

function editSig(id: string): string {
  return crypto.createHmac("sha256", editSecret()).update(`application-edit:${id}`).digest("base64url").slice(0, 32);
}

export function makeApplicationEditToken(id: string): string {
  return `${id}.${editSig(id)}`;
}

/** Returns the application id for a valid token, else null. */
export function verifyApplicationEditToken(token: string): string | null {
  const [id, sig] = String(token).split(".");
  if (!id || !sig || !/^[a-z0-9]+$/i.test(id)) return null;
  const expected = Buffer.from(editSig(id));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  return id;
}

export const APPLICANT_EDITABLE_STATUSES: ReadonlyArray<string> = ["SUBMITTED", "UNDER_REVIEW"];
