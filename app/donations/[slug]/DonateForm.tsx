"use client";

import { useState } from "react";
import Script from "next/script";
import { inrShort as fmt } from "@/lib/format";

const presets = [500, 1000, 2500, 5000, 10000];

type Method = "razorpay" | "qr" | "offline";

declare global {
  interface Window {
    Razorpay: any;
  }
}

interface RazorpayResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

export default function DonateForm({ slug }: { slug: string }) {
  const [method, setMethod] = useState<Method>("razorpay");
  const [amount, setAmount] = useState<number | "">("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [done, setDone] = useState<{ amount: number; name: string; method: Method } | null>(null);

  function readDonor(form: FormData) {
    const first = String(form.get("firstName") ?? "").trim();
    const last  = String(form.get("lastName") ?? "").trim();
    return {
      slug,
      amount: Number(form.get("amount")),
      name: [first, last].filter(Boolean).join(" "),
      email: String(form.get("email") ?? "").trim(),
      phone: String(form.get("phone") ?? "").trim(),
      address: String(form.get("address") ?? "").trim(),
    };
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);

    const form = new FormData(e.currentTarget);
    const donor = readDonor(form);

    try {
      if (method === "razorpay") {
        await runRazorpay(donor);
      } else if (method === "offline") {
        await runOffline(donor);
        setDone({ amount: donor.amount, name: donor.name, method });
      } else {
        await runQr(donor);
        setDone({ amount: donor.amount, name: donor.name, method });
      }
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function runRazorpay(d: { slug: string; amount: number; name: string; email: string; phone: string }) {
    const orderRes = await fetch("/api/donate/online", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(d),
    });
    const orderData = await orderRes.json();
    if (!orderRes.ok) throw new Error(orderData.error ?? "Could not start payment.");

    if (typeof window.Razorpay !== "function") {
      throw new Error("Payment library failed to load. Refresh and try again.");
    }

    const rzp = new window.Razorpay({
      key: orderData.keyId,
      amount: orderData.amount,
      currency: orderData.currency,
      order_id: orderData.orderId,
      name: "MicroCharity Trust",
      description: orderData.causeTitle,
      image: "/favicon.png",
      prefill: orderData.prefill,
      theme: { color: "#cc2222" },
      handler: async (response: RazorpayResponse) => {
        try {
          const verifyRes = await fetch("/api/donate/verify", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(response),
          });
          if (!verifyRes.ok) throw new Error("Could not verify payment");
          setDone({ amount: d.amount, name: d.name, method: "razorpay" });
        } catch {
          setMsg("Payment received — confirmation is taking a moment. You'll receive a receipt by email shortly.");
        } finally {
          setBusy(false);
        }
      },
      modal: { ondismiss: () => { setBusy(false); setMsg(null); } },
    });
    rzp.on("payment.failed", (resp: { error?: { description?: string } }) => {
      setMsg(resp.error?.description ?? "Payment failed. Please try again.");
      setBusy(false);
    });
    rzp.open();
  }

  async function runOffline(d: ReturnType<typeof readDonor>) {
    const res = await fetch("/api/donate/offline", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(d),
    });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error ?? "Could not submit.");
  }

  async function runQr(d: ReturnType<typeof readDonor>) {
    const res = await fetch("/api/donate/qr", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(d),
    });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error ?? "Could not submit.");
  }

  if (done) {
    return (
      <div className="mt-6 rounded-lg bg-green-50 border border-green-200 p-4">
        <div className="flex items-center gap-2 mb-2">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-green-700"><polyline points="20 6 9 17 4 12"/></svg>
          <p className="font-display text-base text-green-800">Thank you, {done.name.split(" ")[0]}!</p>
        </div>
        {done.method === "razorpay" ? (
          <p className="text-sm text-green-800/85 leading-relaxed">
            Your donation of <strong>{fmt(done.amount)}</strong> has been received. Your 80G receipt will be emailed to you shortly. 100% reaches the cause.
          </p>
        ) : (
          <p className="text-sm text-green-800/85 leading-relaxed">
            We&apos;ve received your donation details for <strong>{fmt(done.amount)}</strong>. We&apos;ve sent an acknowledgment email; your 80G receipt will be emailed once we verify the payment in our bank account.
          </p>
        )}
      </div>
    );
  }

  return (
    <>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" />
      <form onSubmit={onSubmit} className="mt-6 space-y-5">
        {/* Amount */}
        <div>
          <label className="block text-sm font-semibold text-ink mb-2">Choose an amount (₹)</label>
          <div className="grid grid-cols-3 gap-2">
            {presets.map(p => (
              <button
                key={p}
                type="button"
                onClick={() => setAmount(p)}
                className={`rounded-lg border px-2 py-2 text-sm font-semibold transition ${amount === p ? "border-accent-600 bg-accent-50 text-accent-700" : "border-[var(--color-line)] hover:border-accent-600 text-ink"}`}
              >
                {fmt(p)}
              </button>
            ))}
          </div>
          <input
            type="number"
            name="amount"
            min="100"
            step="100"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value === "" ? "" : Number(e.target.value))}
            placeholder="Or enter another amount"
            className="mt-3 w-full rounded-lg border border-[var(--color-line)] focus:border-accent-600 focus:ring-2 focus:ring-accent-100 outline-none px-3 py-2.5 text-sm"
          />
        </div>

        {/* Payment method */}
        <div>
          <label className="block text-sm font-semibold text-ink mb-2">Payment method</label>
          <div className="space-y-2">
            <MethodOption value="razorpay" current={method} onChange={setMethod}
              title="Cards, Netbanking & UPI" sub="Pay instantly via Razorpay. 80G receipt emailed immediately." />
            <MethodOption value="qr" current={method} onChange={setMethod}
              title="UPI QR Code" sub="Scan with any UPI app. Submit your UTR after paying." />
            <MethodOption value="offline" current={method} onChange={setMethod}
              title="Offline (NEFT / IMPS / RTGS)" sub="Bank transfer. Receipt issued once we verify the credit." />
          </div>
        </div>

        {/* Method-specific UI */}
        {method === "qr" && (
          <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-soft)] p-4 space-y-3">
            <p className="text-sm text-ink leading-relaxed">
              Scan the QR code below with Google Pay, PhonePe, Paytm, Amazon Pay, or any bank&apos;s UPI app, then submit your details below so we can match the payment.
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/qr-code.jpg" alt="UPI QR code for MicroCharity" className="block mx-auto w-48 h-48 object-contain rounded-lg bg-white border border-[var(--color-line)]" />
          </div>
        )}

        {method === "offline" && (
          <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-soft)] p-4 text-sm space-y-2">
            <p className="text-ink leading-relaxed">In order to make an offline donation we ask that you please follow these instructions:</p>
            <p className="text-ink/85 leading-relaxed">Make a NEFT / IMPS / RTGS transfer to our bank account from your Indian bank account.</p>
            <ul className="text-ink leading-relaxed space-y-0.5">
              <li><span className="text-muted">Name</span> — MicroCharity Trust</li>
              <li><span className="text-muted">A/C No</span> — 0583073000000025</li>
              <li><span className="text-muted">Account Type</span> — CURRENT ACCOUNT</li>
              <li><span className="text-muted">Bank</span> — SOUTH INDIAN BANK</li>
              <li><span className="text-muted">Branch</span> — Kengeri Satellite Town, Bangalore</li>
              <li><span className="text-muted">IFSC Code</span> — SIBL0000583</li>
            </ul>
            <p className="text-muted leading-relaxed">All contributions will be gratefully acknowledged and are tax deductible.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <Field label="Bank Reference (optional)" name="reference" />
              <Field label="Payment Date" name="paymentDate" type="date" />
            </div>
          </div>
        )}

        {/* Donor details */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="First name" name="firstName" required />
          <Field label="Last name" name="lastName" />
          <Field label="Email" name="email" type="email" required colSpan />
          <Field label="Phone" name="phone" type="tel" required={method !== "razorpay"} />
          <Field label="Address (city, state)" name="address" required={method !== "razorpay"} placeholder="e.g. Bangalore, Karnataka" />
        </div>

        <button type="submit" disabled={busy} className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-accent-600 hover:bg-accent-700 disabled:opacity-60 text-white font-semibold px-6 py-3 transition">
          {busy ? "Submitting…" : method === "razorpay" ? "Donate now" : method === "qr" ? "I have paid — submit details" : "Submit offline donation"}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
        </button>
        <p className="text-xs text-muted leading-relaxed">
          100% of your contribution reaches the beneficiary. Eligible for 80G tax exemption.
        </p>
        {msg && <p className="text-sm text-accent-700">{msg}</p>}
      </form>
    </>
  );
}

function MethodOption({
  value, current, onChange, title, sub,
}: { value: Method; current: Method; onChange: (v: Method) => void; title: string; sub: string }) {
  const active = current === value;
  return (
    <label className={`flex items-start gap-3 cursor-pointer rounded-lg border p-3 transition ${active ? "border-accent-600 bg-accent-50" : "border-[var(--color-line)] hover:border-accent-600"}`}>
      <input
        type="radio"
        name="method"
        value={value}
        checked={active}
        onChange={() => onChange(value)}
        className="mt-1 accent-accent-600"
      />
      <div>
        <div className="text-sm font-semibold text-ink">{title}</div>
        <div className="text-xs text-muted">{sub}</div>
      </div>
    </label>
  );
}

function Field({
  label, name, type = "text", required, placeholder, colSpan,
}: { label: string; name: string; type?: string; required?: boolean; placeholder?: string; colSpan?: boolean }) {
  return (
    <div className={colSpan ? "sm:col-span-2" : ""}>
      <label className="block text-sm font-semibold text-ink mb-1">{label}{required && <span className="text-accent-600"> *</span>}</label>
      <input
        type={type}
        name={name}
        required={required}
        placeholder={placeholder}
        className="w-full rounded-lg border border-[var(--color-line)] focus:border-accent-600 focus:ring-2 focus:ring-accent-100 outline-none px-3 py-2.5 text-sm"
      />
    </div>
  );
}
