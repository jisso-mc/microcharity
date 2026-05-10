// Cause-application form types, validation, and helpers.
//
// Four form types map to distinct payload shapes (see `*Data` types below).
// All shapes also carry the same identity / reference / bank / acknowledgement blocks.
// Files (photo, doctor's certificate, NGO declaration, reference letter) are NEVER
// stored — they're forwarded once to info@microcharity.com and only their metadata
// (filename, size, mime, slot) lands in the DB.

import type { Prisma, ApplicationFormType } from "@prisma/client";

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
  field: "photo" | "medicalCertificate" | "referenceLetter" | "ngoDeclaration";
  filename: string;
  size: number;
  mimeType: string;
};

// ---------- Per-form-type payloads ----------

export type EducationalData = {
  applicant: IndividualApplicant;
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
      applicant, father, mother, course, educationHistory, fundingRequested, totalAmount,
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
      applicant, family, annualIncome, medicalCircumstances, totalAmount,
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
      applicant, family, annualIncome, causeCircumstances, totalAmount,
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
      organization, fundingPurpose, fundingItems, totalAmount,
      reference, bankDetails, acknowledgement,
    } satisfies OrganizationalData;
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, data: result, fullName, phone, email };
}

// ---------- File-upload guards ----------

export const ATTACHMENT_RULES = {
  photo: { maxBytes: 5 * 1024 * 1024, accept: ["image/jpeg", "image/png", "image/webp"] },
  medicalCertificate: { maxBytes: 8 * 1024 * 1024, accept: ["application/pdf", "image/jpeg", "image/png"] },
  referenceLetter: { maxBytes: 8 * 1024 * 1024, accept: ["application/pdf", "image/jpeg", "image/png"] },
  ngoDeclaration: { maxBytes: 8 * 1024 * 1024, accept: ["application/pdf", "image/jpeg", "image/png"] },
} satisfies Record<AttachmentMeta["field"], { maxBytes: number; accept: string[] }>;

export const ATTACHMENT_TOTAL_MAX = 20 * 1024 * 1024; // 20 MB combined ceiling
