// MicroCharity Trust constants — used on donation receipts and on the offline-donation
// instructions panel. Sourced from the legacy 80G receipt template.
// Edit here if any of these change; they're stamped onto every receipt PDF.

export const TRUST = {
  name: "MicroCharity Trust",
  legalName: "MicroCharity Trust",
  pan: "AADTM8753H",
  exemption80G:
    "DIT(E)BLR/80G/K-70/AATFM6359B/ITO(E)-2/Vol 2014-2015",
  csrNumber: "CSR00006450",
  trustRegistration: "KEN-4-00113-2010-11",
  registrationSince: "15-July-2014",
  address: {
    // Single-line address used on the receipt header.
    line1: "Bangalore Karnataka 560060 India",
    // Legacy two-line address kept for emails / older surfaces.
    legacyLine1: "112 West Village, Kengeri",
    legacyLine2: "Bangalore - 560060",
  },
  website: "https://www.microcharity.com",
  email: "Info@microcharity.com",
  financeEmail: "finance@microcharity.com",
  exemptionOrderUrl:
    "http://www.microcharity.com/public/docs/MicroCharityTrust80GExemptionOrder.pdf",
  // Authorized signatory shown on the receipt.
  signatory: {
    name: "Melvin Mathews",
    title: "Authorized Signature",
  },
};

// Recipients of test-mode launch announcements. Edit this list (not the schema)
// when a new admin needs to be in the loop on email QA. Kept in code so it's
// version-controlled — env vars get forgotten.
export const TEST_ANNOUNCEMENT_RECIPIENTS: Array<{ name: string; email: string }> = [
  { name: "Jisso Jose",  email: "jissojose@gmail.com" },
  { name: "Nanz Willy",  email: "nanzwilly@gmail.com" },
  { name: "Biju",        email: "bijuu@gmail.com" },
];

// NEFT / IMPS / RTGS bank details shown to donors who choose Offline mode.
export const BANK = {
  accountName: "MicroCharity Trust",
  accountNumber: "0583073000000025",
  accountType: "CURRENT ACCOUNT",
  bank: "SOUTH INDIAN BANK",
  branch: "Kengeri Satellite Town, Bangalore",
  ifsc: "SIBL0000583",
};
