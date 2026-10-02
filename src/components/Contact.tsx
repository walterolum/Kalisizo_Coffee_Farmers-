"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  CircleAlert,
  CircleCheck,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Send,
} from "lucide-react";
import { Reveal } from "@/components/Reveal";
import { SectionHeading } from "@/components/SectionHeading";
import { CONTACT, INQUIRY_TYPES } from "@/lib/data";
import { fetchSettings, type ApiSettings } from "@/lib/api";
import { resolveSocials } from "@/lib/social-design";
import { useRealtimePoll } from "@/lib/realtime";

type FormState = {
  name: string;
  email: string;
  phone: string;
  type: string;
  message: string;
};

type FormErrors = Partial<Record<keyof FormState, string>>;

const INITIAL: FormState = {
  name: "",
  email: "",
  phone: "",
  type: INQUIRY_TYPES[0],
  message: "",
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * @param headingLevel
 *   `1` on `/contact`, where this section is the page's main heading. Left at `2`
 *   on the home page, where `Hero` already supplies the `h1` and this is one
 *   section among many.
 */
export function Contact({ headingLevel = 2 }: { headingLevel?: 1 | 2 }) {
  const [form, setForm] = useState<FormState>(INITIAL);
  const [errors, setErrors] = useState<FormErrors>({});
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [toast, setToast] = useState(false);
  const [settings, setSettings] = useState<ApiSettings | null>(null);

  const loadSettings = useCallback(async () => {
    const info = await fetchSettings();
    if (!info) return;
    setSettings(info);
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  useRealtimePoll(loadSettings, undefined, "settings");

  const displayEmail = settings?.officialEmail || CONTACT.email;
  const displayPhones =
    settings?.phoneNumbers && settings.phoneNumbers.length > 0 ? settings.phoneNumbers : CONTACT.phones;
  const displayAddress = settings?.address || CONTACT.address;
  // The first couple of handles the CMS publishes, so this sentence follows the
  // links rather than a hard-coded pair that may not exist any more.
  const socialHandles = resolveSocials(settings?.socials)
    .slice(0, 2)
    .map((social) => social.handle);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(false), 4800);
    return () => clearTimeout(t);
  }, [toast]);

  const setField = (field: keyof FormState, value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  };

  const validate = (): boolean => {
    const next: FormErrors = {};
    if (!form.name.trim()) next.name = "Please enter your full name.";
    if (!form.email.trim()) next.email = "An email address is required.";
    else if (!EMAIL_REGEX.test(form.email.trim()))
      next.email = "Enter a valid email address.";
    if (!form.message.trim()) next.message = "Please tell us a little more.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const USER_TYPE_BY_INQUIRY: Record<string, "FARMER" | "BUYER" | "GENERAL"> = {
    "Farmer Support": "FARMER",
    "Coffee Buyer / Wholesale": "BUYER",
    "Membership Application": "GENERAL",
    "SACCO & Loans": "GENERAL",
    "General Inquiry": "GENERAL",
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!validate()) return;
    setStatus("sending");
    setSubmitError(null);
    try {
      const res = await fetch("/api/v1/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          subject: form.type,
          userType: USER_TYPE_BY_INQUIRY[form.type] ?? "GENERAL",
          message: form.message.trim(),
        }),
      });
      if (!res.ok) {
        let message = "Could not send your message. Please try again.";
        try {
          const body = await res.json();
          if (body?.message) message = body.message;
        } catch {
          /* fallback message */
        }
        throw new Error(message);
      }
      setStatus("sent");
      setForm(INITIAL);
      setToast(true);
      setTimeout(() => setStatus("idle"), 500);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Something went wrong. Please try again."
      );
      setStatus("idle");
    }
  };

  const inputClass = (hasError: boolean) =>
    `w-full rounded-2xl border bg-sand/70 px-4 py-3 text-base font-medium text-charcoal placeholder:text-charcoal/60 outline-none transition-all duration-200 focus:bg-white sm:text-[15px] ${
      hasError
        ? "border-red-400/70 focus:border-red-400 focus:ring-4 focus:ring-red-400/10"
        : "border-forest/10 focus:border-gold focus:ring-4 focus:ring-gold/15"
    }`;

  return (
    <section
      id="contact"
      className="relative overflow-hidden bg-cream py-28 lg:py-36"
      aria-labelledby="contact-heading"
    >
      <div
        className="absolute -left-32 bottom-10 h-80 w-80 rounded-full bg-gold/10 blur-3xl"
        aria-hidden="true"
      />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <SectionHeading
            id="contact-heading"
            as={headingLevel === 1 ? "h1" : "h2"}
            eyebrow="Get In Touch"
            title="Contact & Inquiries"
            description="Join the cooperative, ask for farmer support or enquire about coffee and wholesale supply."
          />
        </Reveal>

        <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr]">
          <Reveal delay={80}>
            <div className="flex h-full flex-col gap-4">
              <a
                href={`mailto:${displayEmail}`}
                className="group flex items-center gap-4 rounded-3xl bg-white p-6 shadow-soft ring-1 ring-forest/5 transition-all duration-300 hover:-translate-y-0.5 hover:ring-gold/30"
              >
                <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-emerald-brand to-forest text-cream shadow-card transition-transform duration-300 group-hover:scale-110">
                  <Mail className="size-5" aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-xs font-bold uppercase tracking-wider text-charcoal/50">
                    Email Us
                  </span>
                  <span className="block break-all text-[15px] font-semibold text-forest">
                    {displayEmail}
                  </span>
                </span>
              </a>

              <div className="rounded-3xl bg-white p-6 shadow-soft ring-1 ring-forest/5">
                <span className="flex items-center gap-3 text-xs font-bold uppercase tracking-wider text-charcoal/50">
                  <Phone className="size-4 text-gold-deep" aria-hidden="true" />
                  Call the Office
                </span>
                <div className="mt-3 flex flex-col gap-2">
                  {displayPhones.map((phone) => (
                    <a
                      key={phone}
                      href={`tel:${phone.replace(/\s/g, "")}`}
                      className="text-[15px] font-semibold text-forest transition-colors hover:text-gold-deep"
                    >
                      {phone}
                    </a>
                  ))}
                </div>
              </div>

              <div className="rounded-3xl bg-white p-6 shadow-soft ring-1 ring-forest/5">
                <span className="flex items-center gap-3 text-xs font-bold uppercase tracking-wider text-charcoal/50">
                  <MapPin className="size-4 text-gold-deep" aria-hidden="true" />
                  Visit Us
                </span>
                <a
                  href={CONTACT.mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 block text-[15px] font-semibold leading-relaxed text-forest transition-colors hover:text-gold-deep"
                >
                  {displayAddress}
                  <span className="mt-1 block text-xs font-normal text-charcoal/50">
                    {CONTACT.latitude}, {CONTACT.longitude} · Open in Google Maps
                  </span>
                </a>
              </div>

              <div className="flex h-full flex-col justify-center rounded-3xl bg-forest p-6 shadow-card">
                <p className="font-display text-lg font-semibold leading-snug text-cream">
                  One cooperative, thousands of livelihoods.
                </p>
                <p className="mt-2 text-sm leading-relaxed text-cream/70">
                  {socialHandles.length ? "Follow us on " : "Keep in touch "}
                  {socialHandles.join(" & ")}
                  {socialHandles.length ? " for updates." : " for news and offers."}
                </p>
              </div>
            </div>
          </Reveal>

          <Reveal delay={160}>
            <form
              id="inquiry"
              onSubmit={onSubmit}
              noValidate
              className="rounded-3xl bg-white p-7 shadow-card ring-1 ring-forest/5 sm:p-9"
            >
              <h3 className="font-display text-2xl font-semibold text-forest">
                Send an Inquiry
              </h3>
              <p className="mt-2 text-sm text-charcoal/60">
                Fields marked * are required. We respond within one working day.
              </p>

              <div className="mt-7 grid gap-5 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="name"
                    className="text-sm font-bold text-forest"
                  >
                    Full Name *
                  </label>
                  <input
                    id="name"
                    name="name"
                    type="text"
                    autoComplete="name"
                    value={form.name}
                    onChange={(e) => setField("name", e.target.value)}
                    placeholder="e.g. Namuli Sarah"
                    className={inputClass(!!errors.name)}
                    aria-invalid={errors.name ? true : undefined}
                    aria-describedby={errors.name ? "name-error" : undefined}
                  />
                  {errors.name && (
                    <span
                      id="name-error"
                      role="alert"
                      className="flex items-center gap-1.5 text-xs font-semibold text-red-600"
                    >
                      <CircleAlert className="size-3.5" aria-hidden="true" />
                      {errors.name}
                    </span>
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="email"
                    className="text-sm font-bold text-forest"
                  >
                    Email Address *
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    value={form.email}
                    onChange={(e) => setField("email", e.target.value)}
                    placeholder="you@example.com"
                    className={inputClass(!!errors.email)}
                    aria-invalid={errors.email ? true : undefined}
                    aria-describedby={errors.email ? "email-error" : undefined}
                  />
                  {errors.email && (
                    <span
                      id="email-error"
                      role="alert"
                      className="flex items-center gap-1.5 text-xs font-semibold text-red-600"
                    >
                      <CircleAlert className="size-3.5" aria-hidden="true" />
                      {errors.email}
                    </span>
                  )}
                </div>

                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <label
                    htmlFor="phone"
                    className="text-sm font-bold text-forest"
                  >
                    Phone (optional)
                  </label>
                  <input
                    id="phone"
                    name="phone"
                    type="tel"
                    autoComplete="tel"
                    value={form.phone}
                    onChange={(e) => setField("phone", e.target.value)}
                    placeholder="+256 7XX XXX XXX"
                    className={inputClass(false)}
                  />
                </div>

                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <label
                    htmlFor="type"
                    className="text-sm font-bold text-forest"
                  >
                    Inquiry Type
                  </label>
                  <select
                    id="type"
                    name="type"
                    value={form.type}
                    onChange={(e) => setField("type", e.target.value)}
                    className={inputClass(false)}
                  >
                    {INQUIRY_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <label
                    htmlFor="message"
                    className="text-sm font-bold text-forest"
                  >
                    Message *
                  </label>
                  <textarea
                    id="message"
                    name="message"
                    rows={5}
                    value={form.message}
                    onChange={(e) => setField("message", e.target.value)}
                    placeholder="Tell us what you need: membership, inputs, coffee supply, SACCO support…"
                    className={`${inputClass(!!errors.message)} resize-none`}
                    aria-invalid={errors.message ? true : undefined}
                    aria-describedby={errors.message ? "message-error" : undefined}
                  />
                  {errors.message && (
                    <span
                      id="message-error"
                      role="alert"
                      className="flex items-center gap-1.5 text-xs font-semibold text-red-600"
                    >
                      <CircleAlert className="size-3.5" aria-hidden="true" />
                      {errors.message}
                    </span>
                  )}
                </div>
              </div>

              <button
                type="submit"
                disabled={status === "sending"}
                className="group btn btn-primary btn-lg mt-7 w-full disabled:cursor-not-allowed disabled:opacity-70"
              >
                {status === "sending" ? (
                  <>
                    <Loader2 className="size-5 animate-spin" aria-hidden="true" />
                    Sending…
                  </>
                ) : (
                  <>
                    Send Inquiry
                    <Send
                      className="size-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                      aria-hidden="true"
                    />
                  </>
                )}
              </button>

              {status === "sent" && (
                <p
                  role="status"
                  className="mt-4 flex items-center justify-center gap-2 rounded-2xl bg-emerald-brand/10 px-4 py-3 text-sm font-semibold text-emerald-brand"
                >
                  <CircleCheck className="size-4" aria-hidden="true" />
                  Thank you! Your message has been recorded.
                </p>
              )}

              {submitError && (
                <p
                  role="alert"
                  className="mt-4 flex items-center justify-center gap-2 rounded-2xl bg-red-600/10 px-4 py-3 text-sm font-semibold text-red-600 ring-1 ring-red-500/20"
                >
                  <CircleAlert className="size-4 shrink-0" aria-hidden="true" />
                  {submitError}
                </p>
              )}
            </form>
          </Reveal>
        </div>
      </div>

      <div
        className={`fixed bottom-6 inset-x-4 z-[70] flex items-start gap-3 rounded-2xl bg-forest px-5 py-4 text-cream shadow-card ring-1 ring-white/10 transition-all duration-300 sm:inset-x-auto sm:right-6 sm:max-w-sm ${
          toast
            ? "translate-y-0 opacity-100"
            : "pointer-events-none translate-y-4 opacity-0"
        }`}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <CircleCheck className="mt-0.5 size-5 shrink-0 text-gold-light" />
        <span>
          <span className="block text-sm font-bold">Message received!</span>
          <span className="block text-[13px] text-cream/70">
            Our team will get back to you shortly. Welcome to the cooperative
            family!
          </span>
        </span>
      </div>
    </section>
  );
}