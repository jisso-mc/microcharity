"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { editDonationAction, type FormState } from "../../actions";
import DonorPicker, { type DonorOption } from "../../new/DonorPicker";

type CauseOption = { id: string; title: string; status: string };

const inputCls = "w-full rounded-lg border border-[var(--color-line)] focus:border-accent-600 focus:ring-2 focus:ring-accent-100 outline-none px-3 py-2.5 text-sm";

export default function EditDonationForm({
  donationId,
  donors,
  causes,
  initial,
}: {
  donationId: string;
  donors: DonorOption[];
  causes: CauseOption[];
  initial: { donor: DonorOption | null; causeId: string; type: string; amount: number; date: string };
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(editDonationAction, {});
  const [donor, setDonor] = useState<DonorOption | null>(initial.donor);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="id" value={donationId} />
      <input type="hidden" name="donorId" value={donor?.id ?? ""} />

      <div>
        <label className="block text-sm font-semibold text-ink mb-2">Donor *</label>
        <DonorPicker donors={donors} selected={donor} loading={false} onSelect={setDonor} />
        <p className="text-xs text-muted mt-1">
          Changing the donor copies the new donor&apos;s name, email, address and PAN onto this donation.
        </p>
      </div>

      <div>
        <label className="block text-sm font-semibold text-ink mb-2">Cause *</label>
        <select name="causeId" required defaultValue={initial.causeId} className={`${inputCls} bg-white`}>
          {causes.map(c => (
            <option key={c.id} value={c.id}>
              {c.title}{c.status !== "PUBLISHED" ? ` · ${c.status.toLowerCase()}` : ""}
            </option>
          ))}
        </select>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-semibold text-ink mb-2">Type *</label>
          <select name="type" defaultValue={initial.type} className={`${inputCls} bg-white`}>
            <option value="ONLINE">Online (Razorpay)</option>
            <option value="QR">UPI / QR</option>
            <option value="OFFLINE">Offline (bank transfer)</option>
            <option value="MANUAL">Manual (cheque / cash / other)</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-semibold text-ink mb-2">Amount (₹) *</label>
          <input type="number" name="amount" min={1} step={1} required defaultValue={initial.amount} className={inputCls} />
        </div>
        <div>
          <label className="block text-sm font-semibold text-ink mb-2">Date *</label>
          <input type="date" name="date" required defaultValue={initial.date} className={inputCls} />
        </div>
      </div>

      {state.error && (
        <p className="text-sm text-accent-700 bg-accent-50 border border-accent-200 rounded-lg px-3 py-2">{state.error}</p>
      )}

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={pending || !donor}
          aria-busy={pending}
          className="inline-flex items-center gap-2 rounded-full bg-accent-600 hover:bg-accent-700 disabled:opacity-60 disabled:cursor-wait text-white font-semibold px-6 py-3 transition"
        >
          {pending && (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="animate-spin" aria-hidden="true">
              <path d="M21 12a9 9 0 1 1-6.2-8.55" />
            </svg>
          )}
          {pending ? "Saving…" : "Save changes"}
        </button>
        <Link href="/admin/donations" className="text-sm text-muted hover:text-ink">Cancel</Link>
      </div>
    </form>
  );
}
