"use client";

import { ChevronRight, HeartHandshake, Lock, Mail, MapPin, Phone } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { BRAND, CONTACT, NAV_LINKS, SERVICES } from "@/lib/data";
import { fetchSettings, type ApiSettings } from "@/lib/api";
import { resolveSocials, socialTarget } from "@/lib/social-design";
import { useRealtimePoll } from "@/lib/realtime";

export function Footer() {
  const year = new Date().getFullYear();
  const [settings, setSettings] = useState<ApiSettings | null>(null);

  const load = useCallback(async () => {
    const info = await fetchSettings();
    if (!info) return;
    setSettings(info);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useRealtimePoll(load, undefined, "settings");

  const phones =
    settings?.phoneNumbers && settings.phoneNumbers.length > 0
      ? settings.phoneNumbers
      : CONTACT.phones;
  const email = settings?.officialEmail || CONTACT.email;
  const address = settings?.address || CONTACT.address;
  const motto = settings?.taglines?.[1] || BRAND.motto;
  // Every link the CMS publishes, in its order — not a fixed set of platforms
  // filtered against it, so a handle added in the admin renders immediately.
  const socialLinks = resolveSocials(settings?.socials);

  return (
    <footer className="relative overflow-hidden bg-forest-deep text-cream">
      <div
        className="absolute -top-32 right-0 h-72 w-72 rounded-full bg-gold/10 blur-3xl"
        aria-hidden="true"
      />
      <div className="relative mx-auto max-w-7xl px-4 pb-10 pt-16 sm:px-6 lg:px-8">
        <div className="grid gap-10 sm:grid-cols-2 sm:gap-x-8 sm:gap-y-12 lg:grid-cols-[1.3fr_0.8fr_1fr_1.1fr]">
          <div>
            <Logo />
            <p className="mt-6 max-w-sm text-sm leading-relaxed text-cream/70">
              Empowering local farmers through quality coffee, sustainable
              agriculture and reliable financial services in Kyotera District.
            </p>
            <p className="mt-4 flex items-center gap-2 text-sm font-bold text-gold-light">
              <HeartHandshake className="size-4" aria-hidden="true" />
              {motto}
            </p>
          </div>

          <nav aria-label="Footer quick links">
            <h3 className="text-xs font-bold uppercase tracking-[0.22em] text-gold">
              Quick Links
            </h3>
            <ul className="mt-5 space-y-2.5">
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  {/* `next/link`, matching the header: these are real routes, so a
                      raw anchor threw away the page on every click. */}
                  <Link
                    href={link.href}
                    className="group inline-flex items-center gap-1.5 text-sm text-cream/75 transition-colors hover:text-gold-light"
                  >
                    <ChevronRight
                      className="size-3.5 text-gold/70 transition-transform duration-200 group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Footer services">
            <h3 className="text-xs font-bold uppercase tracking-[0.22em] text-gold">
              Our Services
            </h3>
            <ul className="mt-5 space-y-2.5">
              {/* Each program has its own page under /programs/[slug]. These used
                  to point at `#services`, an anchor that only exists on the home
                  page, so all four were dead links everywhere else — and even on
                  `/` they advertised four destinations while going to one. */}
              {SERVICES.map((service) => (
                <li key={service.id}>
                  <Link
                    href={`/programs/${service.slug}`}
                    className="group inline-flex items-center gap-1.5 text-sm text-cream/75 transition-colors hover:text-gold-light"
                  >
                    <ChevronRight
                      className="size-3.5 text-gold/70 transition-transform duration-200 group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                    {service.title}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <h3 className="text-xs font-bold uppercase tracking-[0.22em] text-gold">
              Reach Us
            </h3>
            <ul className="mt-5 space-y-3 text-sm text-cream/75">
              <li className="flex items-start gap-3">
                <MapPin className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden="true" />
                <a
                  href={CONTACT.mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition-colors hover:text-gold-light"
                >
                  {address}
                </a>
              </li>
              <li className="flex flex-col gap-1">
                {phones.map((phone) => (
                  <a
                    key={phone}
                    href={`tel:${phone.replace(/\s/g, "")}`}
                    className="flex items-center gap-3 transition-colors hover:text-gold-light"
                  >
                    <Phone className="size-4 shrink-0 text-gold" aria-hidden="true" />
                    {phone}
                  </a>
                ))}
              </li>
              <li>
                <a
                  href={`mailto:${email}`}
                  className="flex items-center gap-3 transition-colors hover:text-gold-light"
                >
                  <Mail className="size-4 shrink-0 text-gold" aria-hidden="true" />
                  {email}
                </a>
              </li>
            </ul>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              {socialLinks.map((social) => (
                <a
                  key={social.key}
                  href={social.url}
                  {...socialTarget(social.url)}
                  aria-label={`Follow us on ${social.platform} (${social.handle})`}
                  className="grid size-11 place-items-center rounded-xl bg-white/5 text-cream/80 ring-1 ring-white/10 transition-all duration-300 hover:-translate-y-0.5 hover:bg-gold hover:text-forest"
                >
                  <social.icon className="size-5" aria-hidden="true" />
                </a>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-7 text-center sm:flex-row sm:text-left">
          <p className="text-[13px] text-cream/55">
            © {year} {BRAND.name}.
          </p>
          <div className="flex flex-col items-center gap-2 sm:flex-row sm:gap-6">
            <p className="text-[13px] text-cream/55">
              Kalisizo Sub County, Kyotera District ·{" "}
              <span className="text-gold/80">Together for Prosperity</span>
            </p>
            <a
              href="/admin"
              className="btn btn-ghost btn-sm"
            >
              <Lock className="size-3.5" aria-hidden="true" />
              Admin
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}