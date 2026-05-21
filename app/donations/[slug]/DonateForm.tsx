"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
  const [method, setMethod] = useState<Method>("razorpay");
  const [amount, setAmount] = useState<number | "">("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [done, setDone] = useState<{ amount: number; name: string; method: Method } | null>(null);

  function readDonor(form: FormData) {
    return {
      slug,
      amount: Number(form.get("amount")),
      name:  String(form.get("name") ?? "").trim(),
      phone: String(form.get("phone") ?? "").trim(),
      email: String(form.get("email") ?? "").trim(),
      // PAN normalised to upper-case + stripped of stray whitespace before it
      // leaves the browser. Validation against the Indian PAN regex happens
      // server-side; we only do shape-cleanup here so the user sees their
      // canonicalised value if validation fails.
      pan:   String(form.get("pan") ?? "").trim().toUpperCase(),
      address: String(form.get("address") ?? "").trim(),
    };
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);

    const form = new FormData(e.currentTarget);
    const donor = readDonor(form);
    // Payment screenshot only relevant for the two manual methods. Razorpay payments
    // are gateway-verified so no proof is needed.
    const screenshot = (method === "offline" || method === "qr")
      ? (form.get("screenshot") as File | null)
      : null;

    try {
      if (method === "razorpay") {
        await runRazorpay(donor);
      } else if (method === "offline") {
        await runOffline(donor, screenshot);
        setDone({ amount: donor.amount, name: donor.name, method });
      } else {
        await runQr(donor, screenshot);
        setDone({ amount: donor.amount, name: donor.name, method });
      }
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function runRazorpay(d: { slug: string; amount: number; name: string; email: string; phone: string; pan: string }) {
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
          // The verify route revalidates "/" and "/donations/[slug]" — calling
          // router.refresh() now pulls the freshly-rendered totals into the
          // already-mounted server components so the donor sees their amount
          // reflected without having to reload.
          router.refresh();
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

  async function runOffline(d: ReturnType<typeof readDonor>, screenshot: File | null) {
    const res = await fetch("/api/donate/offline", { method: "POST", body: buildBody(d, screenshot) });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error ?? "Could not submit.");
  }

  async function runQr(d: ReturnType<typeof readDonor>, screenshot: File | null) {
    const res = await fetch("/api/donate/qr", { method: "POST", body: buildBody(d, screenshot) });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error ?? "Could not submit.");
  }

  // The offline + QR endpoints accept multipart so they can take an optional
  // screenshot. Donor fields are still simple key/value entries.
  function buildBody(d: ReturnType<typeof readDonor>, screenshot: File | null): FormData {
    const fd = new FormData();
    fd.set("slug", d.slug);
    fd.set("amount", String(d.amount));
    fd.set("name", d.name);
    fd.set("phone", d.phone);
    fd.set("email", d.email);
    fd.set("pan", d.pan);
    if (d.address) fd.set("address", d.address);
    if (screenshot && screenshot.size > 0) fd.set("screenshot", screenshot);
    return fd;
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
            <ScreenshotField label="Screenshot of UPI payment (optional)" />
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
            <ScreenshotField label="Screenshot / bank-transfer receipt (optional)" />
          </div>
        )}

        {/* Donor details */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Name" name="name" required colSpan />
          <Field label="Phone" name="phone" type="tel" required />
          <Field label="Email" name="email" type="email" required />
          <Field
            label="PAN"
            name="pan"
            required
            colSpan
            placeholder="e.g. ABCDE1234F"
            autoComplete="off"
            maxLength={10}
            pattern="[A-Za-z]{5}[0-9]{4}[A-Za-z]"
            uppercase
            hint="Required for 80G tax-exempt receipt."
          />
          <Field label="Address (city, state)" name="address" required={method !== "razorpay"} placeholder="e.g. Bangalore, Karnataka" colSpan />
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

function ScreenshotField({ label }: { label: string }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-ink mb-1">{label}</label>
      <input
        type="file"
        name="screenshot"
        accept="image/*,application/pdf"
        className="block w-full text-xs text-ink file:mr-3 file:rounded-md file:border file:border-[var(--color-line)] file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-ink hover:file:border-accent-600 file:cursor-pointer"
      />
      <p className="text-xs text-muted mt-1">JPG, PNG, or PDF. Up to 8 MB. Helps admin verify your payment faster.</p>
    </div>
  );
}

function Field({
  label, name, type = "text", required, placeholder, colSpan, hint,
  autoComplete, inputMode, pattern, maxLength, uppercase,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  colSpan?: boolean;
  hint?: string;
  autoComplete?: string;
  inputMode?: "text" | "email" | "tel" | "numeric" | "decimal";
  pattern?: string;
  maxLength?: number;
  uppercase?: boolean;
}) {
  return (
    <div className={colSpan ? "sm:col-span-2" : ""}>
      <label className="block text-sm font-semibold text-ink mb-1">{label}{required && <span className="text-accent-600"> *</span>}</label>
      <input
        type={type}
        name={name}
        required={required}
        placeholder={placeholder}
        autoComplete={autoComplete}
        inputMode={inputMode}
        pattern={pattern}
        maxLength={maxLength}
        onInput={uppercase ? (e) => { const t = e.currentTarget; const pos = t.selectionStart; t.value = t.value.toUpperCase(); if (pos != null) t.setSelectionRange(pos, pos); } : undefined}
        className="w-full rounded-lg border border-[var(--color-line)] focus:border-accent-600 focus:ring-2 focus:ring-accent-100 outline-none px-3 py-2.5 text-sm"
      />
      {hint && <p className="text-xs text-muted mt-1">{hint}</p>}
    </div>
  );
}
