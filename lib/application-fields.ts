// Client-safe definitions shared by the public application form, the admin Forms
// view, the admin email and the backup PDF: attachment slots per form type, upload
// limits, and the human labels / display order for every payload key.
//
// Server-only helpers (validation against Blob, edit-link tokens) live in
// lib/applications.ts — keep this file free of Node imports so the client form
// can import it.

export type ApplicationType = "EDUCATIONAL" | "MEDICAL" | "INDIVIDUAL" | "ORGANIZATIONAL";

export type AttachmentField =
  | "photo" | "govtId" | "rationCard"
  | "medicalCertificate"            // Medical — letter from consulting doctor
  | "bonafide" | "institutionId"    // Educational
  | "referenceLetter"               // "Supporting documents" on the Individuals form
  | "ngoDeclaration"                // Individuals
  | "other1" | "other2" | "other3"; // "Any other supporting document" (+ button, up to 3)

export type AttachmentSlot = {
  field: AttachmentField;
  label: string;
  help?: string;
  required: boolean;
  imagesOnly?: boolean;
};

// Every file is capped at 2 MB. Uploads go browser → Vercel Blob directly
// (lib/blob client upload), so the 4.5 MB serverless request-body limit never applies.
export const ATTACHMENT_MAX_BYTES = 2 * 1024 * 1024;
// HEIC is deliberately NOT accepted: it can't go into the backup PDF, and when a
// file input doesn't list it, iPhones hand the browser a JPEG instead.
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const DOC_TYPES = [...IMAGE_TYPES, "application/pdf"];

export const OTHER_FIELDS: AttachmentField[] = ["other1", "other2", "other3"];

/** Fixed attachment slots for a form type (the "other" slots are added separately). */
export function attachmentSlots(type: ApplicationType): AttachmentSlot[] {
  const org = type === "ORGANIZATIONAL";
  const slots: AttachmentSlot[] = [
    {
      field: "photo",
      label: "Photo",
      help: org ? "Recent photograph of the contact person." : "Recent photograph of the applicant.",
      required: true,
      imagesOnly: true,
    },
    {
      field: "govtId",
      label: "Valid Govt. ID card — Aadhaar / Voter ID / Passport",
      help: org
        ? "ID of the contact person."
        : "In case of minors, please upload the mother's ID.",
      required: true,
    },
    {
      field: "rationCard",
      label: "Copy of ration card",
      help: "The page where the applicant's name is present.",
      required: false,
    },
  ];
  if (type === "MEDICAL") {
    slots.push({
      field: "medicalCertificate",
      label: "Letter from consulting doctor with signature & seal",
      required: true,
    });
  }
  if (type === "EDUCATIONAL") {
    slots.push(
      {
        field: "bonafide",
        label: "Bonafide certificate from the institution",
        help: "On the letterhead of the institution, stating the applicant is a student there, with fee details.",
        required: true,
      },
      { field: "institutionId", label: "College / School ID card", required: false },
    );
  }
  if (type === "INDIVIDUAL") {
    slots.push(
      { field: "referenceLetter", label: "Supporting documents", required: false },
      { field: "ngoDeclaration", label: "Local NGO / committee declaration", required: false },
    );
  } else {
    slots.push({ field: "referenceLetter", label: "Reference letter", required: false });
  }
  return slots;
}

/** Label for any attachment field (falls back to the field key for legacy rows). */
export function attachmentLabel(type: ApplicationType, field: string): string {
  if ((OTHER_FIELDS as string[]).includes(field)) return "Other supporting document";
  return attachmentSlots(type).find((s) => s.field === field)?.label ?? field;
}

// ---------- Payload labels + display order ----------
//
// Postgres jsonb does not preserve key order, so every renderer walks SECTION_ORDER
// instead of Object.entries(data). Unknown keys are appended after it.

export const SECTION_LABELS: Record<string, string> = {
  applicant:            "Applicant",
  organization:         "Organization",
  situation:            "Situation leading to help request",
  father:               "Father's details",
  mother:               "Mother's details",
  course:               "Course",
  educationHistory:     "Education history",
  fundingRequested:     "Funding requested",
  fundingPurpose:       "Purpose of funding request",
  fundingItems:         "Funding items",
  family:               "Family details",
  annualIncome:         "Annual income of family",
  medicalCircumstances: "Medical circumstances",
  causeCircumstances:   "Cause circumstances",
  totalAmount:          "Total amount of financial assistance required",
  prevAssistance:       "Previously received assistance",
  heardAbout:           "Where heard about MicroCharity",
  reference:            "Reference",
  medicalOfficer:       "Medical officer / certifying doctor",
  ngoDeclarant:         "Local NGO / committee declarant",
  bankDetails:          "Bank account details",
  acknowledgement:      "Applicant acknowledgement",
};

export const SECTION_ORDER = Object.keys(SECTION_LABELS);

export const FIELD_LABELS: Record<string, string> = {
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
  fullLegalName: "Full legal name (e-signature)", date: "Date", place: "Place",
  termsAccepted: "Terms & Conditions accepted",
};

export const fieldLabel = (k: string) => FIELD_LABELS[k] ?? k;
export const sectionLabel = (k: string) => SECTION_LABELS[k] ?? k;

// ---------- Full form template ----------
//
// Every section and field the form has, per type — mirrors the blank payload in
// app/cause-applications/ApplicationForm.tsx. Validation drops blank optional
// fields, so the backup PDF walks this template (printing "—" for blanks) to show
// the complete form rather than only what was filled in.

export type TemplateSection =
  | { key: string; kind: "fields"; fields: string[] }
  | { key: string; kind: "rows"; fields: string[] }
  | { key: string; kind: "text" };

const APPLICANT = ["fullName", "address", "phone", "mobile", "email", "dateOfBirth", "age", "sex"];
const PARENT = ["name", "address", "phone"];
const FAMILY_ROW = ["name", "relationship", "age", "sex", "occupation", "contactNumber"];
const DECLARANT = ["name", "designation", "organization", "contactNumber", "email"];
const REFERENCE = ["name", "address", "phone", "email", "knownSince", "description"];
const BANK = ["accountNumber", "accountHolderName", "bankName", "branch", "ifsc", "relationshipIfNotApplicant"];
const ACK = ["fullLegalName", "date", "place", "termsAccepted"];

const f = (key: string, fields: string[]): TemplateSection => ({ key, kind: "fields", fields });
const rows = (key: string, fields: string[]): TemplateSection => ({ key, kind: "rows", fields });
const text = (key: string): TemplateSection => ({ key, kind: "text" });

export function formTemplate(type: ApplicationType): TemplateSection[] {
  const tail = [f("reference", REFERENCE)];
  const end = [f("bankDetails", BANK), f("acknowledgement", ACK)];
  switch (type) {
    case "EDUCATIONAL":
      return [
        f("applicant", APPLICANT), text("situation"), f("father", PARENT), f("mother", PARENT),
        f("course", ["title", "school"]), rows("educationHistory", ["school", "fromDate", "toDate", "achievements"]),
        f("fundingRequested", ["fees", "uniform", "books", "others"]), text("totalAmount"),
        text("prevAssistance"), text("heardAbout"), ...tail, ...end,
      ];
    case "MEDICAL":
      return [
        f("applicant", APPLICANT), text("situation"), rows("family", FAMILY_ROW), text("annualIncome"),
        text("medicalCircumstances"), text("totalAmount"), text("prevAssistance"), text("heardAbout"),
        ...tail, f("medicalOfficer", DECLARANT), ...end,
      ];
    case "INDIVIDUAL":
      return [
        f("applicant", APPLICANT), text("situation"), rows("family", FAMILY_ROW), text("annualIncome"),
        text("causeCircumstances"), text("totalAmount"), text("prevAssistance"), text("heardAbout"),
        ...tail, f("ngoDeclarant", DECLARANT), ...end,
      ];
    case "ORGANIZATIONAL":
      return [
        f("organization", ["fullName", "address", "phone", "email", "contactPerson", "contactMobile"]),
        text("situation"), text("fundingPurpose"), rows("fundingItems", ["itemName", "nos", "cost"]),
        text("totalAmount"), ...tail, ...end,
      ];
  }
}

// Field order within a section / table row (jsonb loses the original order too).
const FIELD_ORDER = [
  "fullName", "name", "relationship", "designation", "organization", "address",
  "phone", "mobile", "contactNumber", "email", "contactPerson", "contactMobile",
  "dateOfBirth", "age", "sex", "occupation",
  "title", "school", "fromDate", "toDate", "achievements",
  "fees", "uniform", "books", "others", "itemName", "nos", "cost",
  "knownSince", "description",
  "accountNumber", "accountHolderName", "bankName", "branch", "ifsc", "relationshipIfNotApplicant",
  "fullLegalName", "date", "place", "termsAccepted",
];

/** An object's entries in display order (known fields first, then anything else). */
export function orderedFields(obj: Record<string, unknown>): Array<[string, unknown]> {
  const rank = (k: string) => { const i = FIELD_ORDER.indexOf(k); return i < 0 ? FIELD_ORDER.length : i; };
  return Object.entries(obj).sort(([a], [b]) => rank(a) - rank(b));
}

/** Payload entries in display order (known sections first, then anything else). */
export function orderedSections(data: Record<string, unknown>): Array<[string, unknown]> {
  const known = SECTION_ORDER.filter((k) => k in data).map((k) => [k, data[k]] as [string, unknown]);
  const rest = Object.entries(data).filter(([k]) => !SECTION_ORDER.includes(k));
  return [...known, ...rest];
}
