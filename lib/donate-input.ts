// Shared validation for donor-submitted payloads on the offline / QR donation routes.
// Lives outside app/api/* because Next.js disallows non-handler exports from route modules.

export type ParsedDonor = {
  slug: string;
  amount: number;
  name: string;
  email: string;
  phone: string;
  pan: string;
  address?: string;
  reference?: string;
  paymentDate?: Date;
};

// Indian PAN: five letters, four digits, one letter — total 10 chars.
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

/** Returns the normalised PAN (upper-cased, trimmed) or null when invalid / empty. */
export function normalizePan(raw: unknown): string | null {
  const s = String(raw ?? "").trim().toUpperCase().replace(/\s+/g, "");
  if (!s) return null;
  if (!PAN_RE.test(s)) return null;
  return s;
}

export function parseDonorPayload(d: Record<string, unknown>): ParsedDonor | { error: string } {
  const slug   = String(d.slug ?? "").trim();
  const amount = Number(d.amount);
  const name   = String(d.name ?? "").trim();
  const email  = String(d.email ?? "").trim().toLowerCase();
  const phone  = String(d.phone ?? "").trim();
  const address = String(d.address ?? "").trim() || undefined;
  const reference = String(d.reference ?? "").trim() || undefined;
  const paymentDateStr = String(d.paymentDate ?? "").trim();
  const paymentDate = paymentDateStr ? new Date(paymentDateStr) : undefined;
  const pan = normalizePan(d.pan);

  if (!slug)     return { error: "Cause is required." };
  if (!Number.isFinite(amount) || amount < 100) return { error: "Minimum donation is ₹100." };
  if (!name)     return { error: "Your name is required." };
  if (!phone)    return { error: "Phone is required." };
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) return { error: "A valid email is required for the receipt." };
  if (!pan)      return { error: "A valid PAN is required (10 characters, e.g. ABCDE1234F)." };
  if (paymentDate && Number.isNaN(paymentDate.getTime())) return { error: "Invalid payment date." };

  return { slug, amount: Math.round(amount), name, email, phone, pan, address, reference, paymentDate };
}
