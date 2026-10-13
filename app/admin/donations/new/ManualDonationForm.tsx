"use client";

import { useActionState, useState } from "react";
import { createManualDonationAction, type FormState } from "../actions";
import DonorPicker, { type DonorOption } from "./DonorPicker";

type CauseOption = { id: string; title: string; status: string };

const inputCls = "w-full rounded-lg border border-[var(--color-line)] focus:border-accent-600 focus:ring-2 focus:ring-accent-100 outline-none px-3 py-2.5 text-sm";

const EMPTY_DONOR = { donorName: "", donorEmail: "", donorPhone: "", donorAddress: "", pan: "" };

export default function ManualDonationForm({ causes, donors }: { causes: CauseOption[]; donors: DonorOption[] }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(createManualDonationAction, {});

  // Donor fields are controlled so picking a donor can auto-fill them. Everything
  // stays editable — the action upserts the donor by email, so an edited phone /
  // address refreshes their profile.
  const [donor, setDonor] = useState<DonorOption | null>(null);
  const [fields, setFields] = useState(EMPTY_DONOR);
  const [loadingDonor, setLoadingDonor] = useState(false);
  const [donorError, setDonorError] = useState<string | null>(null);
  const set = (k: keyof typeof EMPTY_DONOR) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setFields(f => ({ ...f, [k]: e.target.value }));

  async function selectDonor(d: DonorOption | null) {
    setDonor(d);
    setDonorError(null);
    if (!d) { setFields(EMPTY_DONOR); return; }
    // Fill the non-sensitive fields immediately, then fetch the PAN.
    setFields({ donorName: d.name, donorEmail: d.email, donorPhone: d.phone ?? "", donorAddress: d.address ?? "", pan: "" });
    setLoadingDonor(true);
    try {
      const res = await fetch(`/api/admin/donors/${d.id}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not load donor profile");
      setFields(f => ({ ...f, pan: json.pan ?? "" }));
    } catch (e) {
      setDonorError(e instanceof Error ? e.message : "Could not load donor profile");
    } finally {
      setLoadingDonor(false);
    }
  }

  return (
    <form action={formAction} className="space-y-5">
      <div>
        <label className="block text-sm font-semibold text-ink mb-2">Cause *</label>
        <select name="causeId" required defaultValue="" className={`${inputCls} bg-white`}>
          <option value="" disabled>Select a cause…</option>
          {causes.map(c => (
            <option key={c.id} value={c.id}>
              {c.title}{c.status === "CLOSED" ? " · closed" : ""}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-semibold text-ink mb-2">Existing donor</label>
        <DonorPicker donors={donors} selected={donor} loading={loadingDonor} onSelect={selectDonor} />
        <p className="text-xs text-muted mt-1">
          Pick a donor to auto-fill their details, or leave blank and type them in for a new donor.
        </p>
        {donorError && <p className="text-xs text-accent-700 mt-1">{donorError}</p>}
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-ink mb-2">Donor name *</label>
          <input type="text" name="donorName" required value={fields.donorName} onChange={set("donorName")} className={inputCls} />
        </div>
        <div>
          <label className="block text-sm font-semibold text-ink mb-2">Donor email *</label>
          <input type="email" name="donorEmail" required value={fields.donorEmail} onChange={set("donorEmail")} className={inputCls} />
          <p className="text-xs text-muted mt-1">Used to dedupe donor records (case-insensitive).</p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-ink mb-2">Phone</label>
          <input type="tel" name="donorPhone" value={fields.donorPhone} onChange={set("donorPhone")} className={inputCls} />
        </div>
        <div>
          <label className="block text-sm font-semibold text-ink mb-2">Address</label>
          <input type="text" name="donorAddress" value={fields.donorAddress} onChange={set("donorAddress")} className={inputCls} />
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-semibold text-ink mb-2">Amount (₹) *</label>
          <input type="number" name="amount" min={1} step={1} required className={inputCls} />
        </div>
        <div>
          <label className="block text-sm font-semibold text-ink mb-2">Type *</label>
          <select name="type" defaultValue="MANUAL" className={`${inputCls} bg-white`}>
            <option value="MANUAL">Manual (cheque / cash / other)</option>
            <option value="OFFLINE">Offline (bank transfer)</option>
            <option value="ONLINE">Online (recorded retroactively)</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-semibold text-ink mb-2">Date received</label>
          <input type="date" name="date" className={inputCls} />
          <p className="text-xs text-muted mt-1">Defaults to today.</p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-ink mb-2">Payment reference</label>
          <input type="text" name="paymentReference" placeholder="Cheque no., UTR, etc." className={inputCls} />
        </div>
        <div>
          <label className="block text-sm font-semibold text-ink mb-2">PAN <span className="text-muted font-normal">(if amount &gt; ₹10,000)</span></label>
          <input type="text" name="pan" maxLength={10} value={fields.pan} onChange={set("pan")} placeholder={loadingDonor ? "Loading…" : undefined} className={inputCls} />
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-ink mb-2">Internal notes</label>
        <textarea name="adminNotes" rows={3} placeholder="Anything for the admin record (not shown publicly)…" className={`${inputCls} resize-y`}></textarea>
      </div>

      {state.error && (
        <p className="text-sm text-accent-700 bg-accent-50 border border-accent-200 rounded-lg px-3 py-2">{state.error}</p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-full bg-accent-600 hover:bg-accent-700 disabled:opacity-60 text-white font-semibold px-6 py-3 transition"
        >
          {pending ? "Saving…" : "Save as pending"}
        </button>
        <p className="text-xs text-muted">Approval happens on the next screen — you can edit the amount before approving.</p>
      </div>
    </form>
  );
}
