"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { submitCodOrder, type CheckoutFormInput } from "@/app/actions/checkout";
import { useCart } from "@/components/cart/cart-provider";

const STEPS = ["Contact", "Shipping", "Review"] as const;

const emptyForm: CheckoutFormInput = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  address1: "",
  address2: "",
  city: "",
  province: "",
  country: "",
  zip: "",
};

export default function CheckoutPage() {
  const { lines } = useCart();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<CheckoutFormInput>(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmedOrderId, setConfirmedOrderId] = useState<string | null>(null);

  const subtotal = lines.reduce(
    (sum, l) => sum + parseFloat(l.variant.price) * l.quantity,
    0
  );

  function update<K extends keyof CheckoutFormInput>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    if (fieldErrors[key]) {
      setFieldErrors((errs) => {
        const next = { ...errs };
        delete next[key];
        return next;
      });
    }
  }

  function validateStep(): boolean {
    const errors: Record<string, string> = {};
    if (step === 0) {
      if (!form.firstName) errors.firstName = "Required";
      if (!form.lastName) errors.lastName = "Required";
      if (!form.email || !form.email.includes("@")) errors.email = "Enter a valid email";
      if (!form.phone) errors.phone = "Required";
    } else if (step === 1) {
      if (!form.address1) errors.address1 = "Required";
      if (!form.city) errors.city = "Required";
      if (!form.country) errors.country = "Required";
      if (!form.zip) errors.zip = "Required";
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit() {
    if (!validateStep()) return;
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const result = await submitCodOrder(form);
      if (!result.success) {
        setSubmitError(result.error);
        if (result.fieldErrors) setFieldErrors(result.fieldErrors);
        return;
      }
      setConfirmedOrderId(result.orderId);
    } catch (err) {
      console.error("[checkout] unexpected submit error", err);
      setSubmitError("Something went wrong placing your order. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (confirmedOrderId) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-ivory-bg px-6">
        <div className="max-w-md text-center">
          <h1 className="font-display text-3xl text-ink">Order confirmed</h1>
          <p className="mt-3 text-ink-muted">
            Thank you. Your order is confirmed for Cash on Delivery. Reference:{" "}
            <span className="font-medium text-ink">{confirmedOrderId}</span>
          </p>
          <a
            href="/"
            className="mt-6 inline-block rounded-full bg-ink px-6 py-3 text-sm text-ivory-bg hover:bg-gold-dark"
          >
            Continue shopping
          </a>
        </div>
      </main>
    );
  }

  if (lines.length === 0) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-ivory-bg px-6 text-center">
        <div>
          <p className="font-display text-xl text-ink">Your bag is empty</p>
          <a href="/" className="mt-3 inline-block text-sm text-gold-dark underline">
            Return to shop
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 py-12">
      <h1 className="font-display text-3xl text-ink">Checkout</h1>

      <ol className="mt-6 flex gap-4 text-sm">
        {STEPS.map((label, i) => (
          <li
            key={label}
            className={i === step ? "font-medium text-ink" : "text-ink-muted"}
          >
            {i + 1}. {label}
          </li>
        ))}
      </ol>

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -12 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="mt-8 space-y-4"
        >
          {step === 0 && (
            <>
              <Field label="First name" error={fieldErrors.firstName}>
                <input
                  value={form.firstName}
                  onChange={(e) => update("firstName", e.target.value)}
                  className={inputClass(fieldErrors.firstName)}
                />
              </Field>
              <Field label="Last name" error={fieldErrors.lastName}>
                <input
                  value={form.lastName}
                  onChange={(e) => update("lastName", e.target.value)}
                  className={inputClass(fieldErrors.lastName)}
                />
              </Field>
              <Field label="Email" error={fieldErrors.email}>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => update("email", e.target.value)}
                  className={inputClass(fieldErrors.email)}
                />
              </Field>
              <Field label="Phone" error={fieldErrors.phone}>
                <input
                  value={form.phone}
                  onChange={(e) => update("phone", e.target.value)}
                  className={inputClass(fieldErrors.phone)}
                />
              </Field>
            </>
          )}

          {step === 1 && (
            <>
              <Field label="Address" error={fieldErrors.address1}>
                <input
                  value={form.address1}
                  onChange={(e) => update("address1", e.target.value)}
                  className={inputClass(fieldErrors.address1)}
                />
              </Field>
              <Field label="Apartment, suite, etc. (optional)">
                <input
                  value={form.address2}
                  onChange={(e) => update("address2", e.target.value)}
                  className={inputClass()}
                />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="City" error={fieldErrors.city}>
                  <input
                    value={form.city}
                    onChange={(e) => update("city", e.target.value)}
                    className={inputClass(fieldErrors.city)}
                  />
                </Field>
                <Field label="Province/State">
                  <input
                    value={form.province}
                    onChange={(e) => update("province", e.target.value)}
                    className={inputClass()}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Country" error={fieldErrors.country}>
                  <input
                    value={form.country}
                    onChange={(e) => update("country", e.target.value)}
                    className={inputClass(fieldErrors.country)}
                  />
                </Field>
                <Field label="ZIP/Postal code" error={fieldErrors.zip}>
                  <input
                    value={form.zip}
                    onChange={(e) => update("zip", e.target.value)}
                    className={inputClass(fieldErrors.zip)}
                  />
                </Field>
              </div>
            </>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="rounded-xl border border-ivory-border bg-white/60 p-5">
                <p className="text-sm font-medium text-ink">
                  {form.firstName} {form.lastName}
                </p>
                <p className="text-sm text-ink-muted">{form.email}</p>
                <p className="text-sm text-ink-muted">{form.phone}</p>
                <p className="mt-3 text-sm text-ink-muted">
                  {form.address1}
                  {form.address2 ? `, ${form.address2}` : ""}, {form.city}
                  {form.province ? `, ${form.province}` : ""}, {form.country} {form.zip}
                </p>
              </div>
              <div className="rounded-xl border border-gold/30 bg-gold/10 p-4 text-sm text-ink">
                Payment method: <strong>Cash on Delivery</strong>
              </div>
              <div className="rounded-xl border border-ivory-border bg-white/60 p-5">
                <div className="flex justify-between text-sm">
                  <span className="text-ink-muted">Subtotal</span>
                  <span className="text-ink">${subtotal.toFixed(2)}</span>
                </div>
              </div>
              {submitError && <p className="text-sm text-red-700">{submitError}</p>}
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      <div className="mt-8 flex justify-between">
        {step > 0 ? (
          <button
            onClick={() => setStep((s) => s - 1)}
            className="rounded-full border border-ivory-border px-6 py-3 text-sm text-ink hover:bg-ivory-card"
          >
            Back
          </button>
        ) : (
          <span />
        )}

        {step < STEPS.length - 1 ? (
          <button
            onClick={() => validateStep() && setStep((s) => s + 1)}
            className="rounded-full bg-ink px-6 py-3 text-sm text-ivory-bg hover:bg-gold-dark"
          >
            Continue
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="rounded-full bg-ink px-6 py-3 text-sm text-ivory-bg hover:bg-gold-dark disabled:opacity-50"
          >
            {isSubmitting ? "Placing order…" : "Place order (Cash on Delivery)"}
          </button>
        )}
      </div>
    </main>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-ink">{label}</label>
      <div className="mt-1">{children}</div>
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  );
}

function inputClass(error?: string) {
  return `w-full rounded-lg border ${
    error ? "border-red-400" : "border-ivory-border"
  } bg-white px-3 py-2 text-sm text-ink outline-none focus:border-gold`;
}
