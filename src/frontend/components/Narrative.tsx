"use client";

import Image from "next/image";
import {
  Bean,
  Coffee,
  GraduationCap,
  Handshake,
  Landmark,
  Leaf,
  MapPin,
  PiggyBank,
  Sprout,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Reveal } from "@/frontend/components/Reveal";

/**
 * Icon is named rather than passed as a component. `Impact` is a client
 * component, and a server component cannot hand a function across that
 * boundary — Next throws "Functions cannot be passed directly to Client
 * Components".
 */
const STAT_ICONS: Record<string, LucideIcon> = {
  bean: Bean,
  coffee: Coffee,
  graduationcap: GraduationCap,
  handshake: Handshake,
  landmark: Landmark,
  leaf: Leaf,
  location: MapPin,
  piggybank: PiggyBank,
  sprout: Sprout,
  users: Users,
};

export type Statement = {
  icon: keyof typeof STAT_ICONS | string;
  label: string;
  value: string;
};

/**
 * Full-bleed photographic band with a single centred line over it.
 *
 * Used to break the rhythm between text sections. The photograph is shown
 * untreated and the copy sits on an opaque forest-deep panel, so the picture
 * stays the subject and the text never depends on the image behind it.
 */
export function ImageStatement({
  image,
  alt,
  eyebrow,
  title,
  height = "tall",
}: {
  image: string;
  alt: string;
  eyebrow: string;
  title: string;
  height?: "tall" | "short";
}) {
  const h = height === "tall" ? "min-h-[62svh]" : "min-h-[42svh]";

  return (
    <section
      aria-label={title}
      className={`surface-dark relative isolate flex items-center justify-center overflow-hidden ${h}`}
    >
      {/* Untreated photograph, copy set directly on it - no panel. One localised
          scrim sits under the type; the scrim follows the `<Image>` in the DOM
          so it paints on top of it. */}
      <Image
        src={image}
        alt={alt}
        fill
        sizes="100vw"
        quality={70}
        className="-z-10 object-cover"
      />
      <div className="photo-scrim -z-10" aria-hidden="true" />
      <div className="on-photo relative mx-auto max-w-4xl px-5 py-24 text-center sm:px-6">
        <Reveal>
          <p className="on-photo-sm text-[11px] font-semibold uppercase tracking-[0.3em] text-gold-light">
            {eyebrow}
          </p>
          <h2 className="mt-7 font-display text-balance text-[clamp(1.7rem,0.9rem+2.6vw,3.1rem)] font-semibold leading-[1.14] tracking-[-0.015em] text-cream">
            {title}
          </h2>
        </Reveal>
      </div>
    </section>
  );
}

/**
 * Editorial image + text split. `reverse` flips the order on desktop; on mobile
 * the image always comes first so both halves keep a natural top-to-bottom read.
 */
export function StorySplit({
  image,
  alt,
  eyebrow,
  title,
  body,
  cta,
  ctaHref = "#about",
  reverse = false,
  tone = "light",
}: {
  image: string;
  alt: string;
  eyebrow: string;
  title: string;
  body: string[];
  cta?: string;
  ctaHref?: string;
  reverse?: boolean;
  tone?: "light" | "dark";
}) {
  const dark = tone === "dark";
  const order = reverse ? "lg:order-2" : "";

  return (
    <section
      className={`relative overflow-hidden py-24 lg:py-32 ${
        dark ? "bg-forest-deep" : "bg-cream"
      }`}
    >
      <div className="relative mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
          <Reveal className={order}>
            <div className="group relative overflow-hidden rounded-[1.75rem]">
              <div className="relative aspect-4/5 w-full sm:aspect-4/3 lg:aspect-4/5">
                <Image
                  src={image}
                  alt={alt}
                  fill
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  quality={70}
                  className="object-cover transition-transform duration-[900ms] ease-out group-hover:scale-[1.05]"
                />
                {/* Untreated photograph - no gradient, scrim or tint over it. */}
              </div>
              <div
                className="pointer-events-none absolute inset-0 rounded-[1.75rem] ring-1 ring-inset ring-black/5"
                aria-hidden="true"
              />
            </div>
          </Reveal>

          <Reveal delay={120}>
            <div className="max-w-xl">
              <p
                className={`text-[11px] font-semibold uppercase tracking-[0.3em] ${
                  dark ? "text-gold-light" : "text-clay"
                }`}
              >
                {eyebrow}
              </p>
              <h2
                className={`mt-6 font-display text-balance text-[clamp(1.85rem,0.9rem+2.7vw,3.2rem)] font-semibold leading-[1.1] tracking-[-0.018em] ${
                  dark ? "text-cream" : "text-forest"
                }`}
              >
                {title}
              </h2>
              <div className="mt-8 space-y-5">
                {body.map((para) => (
                  <p
                    key={para.slice(0, 32)}
                    className={`text-[17px] leading-[1.75] ${
                      dark ? "text-cream/70" : "text-muted"
                    }`}
                  >
                    {para}
                  </p>
                ))}
              </div>
              {cta && (
                <a
                  href={ctaHref}
                  className={`group btn btn-lg mt-10 ${
                    dark ? "btn-ghost" : "btn-outline"
                  }`}
                >
                  {cta}
                  <span
                    className="transition-transform duration-300 group-hover:translate-x-1"
                    aria-hidden="true"
                  >
                    →
                  </span>
                </a>
              )}
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/**
 * Numbered journey. Presented as a single horizontal rule with markers rather
 * than four separate cards, which keeps the section quiet and editorial.
 */
export function Journey({
  steps,
}: {
  steps: { label: string; title: string; body: string }[];
}) {
  return (
    <section className="relative overflow-hidden bg-leaf/50 py-24 lg:py-32">
      <div className="relative mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
        <Reveal>
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-clay">
              How It Works
            </p>
            <h2 className="mt-6 font-display text-balance text-[clamp(1.85rem,0.9rem+2.7vw,3.2rem)] font-semibold leading-[1.1] tracking-[-0.018em] text-forest">
              From the field to a better price
            </h2>
            <p className="mt-6 text-[17px] leading-[1.75] text-muted">
              Four steps, each visible to the member. Nothing in the chain is
              hidden behind a summary.
            </p>
          </div>
        </Reveal>

        <ol className="relative mt-16 grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
          <span
            className="absolute left-0 right-0 top-[11px] hidden h-px bg-forest/12 lg:block"
            aria-hidden="true"
          />
          {steps.map((step, i) => (
            <Reveal key={step.title} delay={i * 90} as="li">
              <div className="relative">
                <span
                  className="relative z-10 grid size-[22px] place-items-center rounded-full border border-gold/40 bg-cream"
                  aria-hidden="true"
                >
                  <span className="size-1.5 rounded-full bg-gold" />
                </span>
                <p className="mt-7 text-[11px] font-semibold uppercase tracking-[0.24em] text-clay">
                  {String(i + 1).padStart(2, "0")} {step.label}
                </p>
                <h3 className="mt-3 font-display text-xl font-semibold leading-snug text-forest">
                  {step.title}
                </h3>
                <p className="mt-3 text-[15px] leading-[1.7] text-muted">
                  {step.body}
                </p>
              </div>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

/**
 * Impact figures. Counts come from live data the site already loads, so these
 * cannot drift from reality the way a hardcoded marketing number would.
 */
export function Impact({
  stats,
  eyebrow = "Our Reach",
  title = "What the cooperative holds together",
}: {
  stats: Statement[];
  eyebrow?: string;
  title?: string;
}) {
  return (
    <section className="surface-dark relative overflow-hidden bg-forest py-24 lg:py-32">
      <div
        className="absolute -left-32 top-1/4 size-96 rounded-full bg-brand/20 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="absolute -right-24 bottom-0 size-80 rounded-full bg-gold/10 blur-3xl"
        aria-hidden="true"
      />

      <div className="relative mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
        <Reveal>
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-gold-light">
              {eyebrow}
            </p>
            <h2 className="mt-6 font-display text-balance text-[clamp(1.85rem,0.9rem+2.7vw,3.2rem)] font-semibold leading-[1.1] tracking-[-0.018em] text-cream">
              {title}
            </h2>
          </div>
        </Reveal>

        <dl className="mt-16 grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
          {stats.map((stat, i) => {
            const Icon = STAT_ICONS[stat.icon] ?? Bean;
            return (
              <Reveal key={stat.label} delay={i * 90}>
                <div className="text-center">
                  <dt className="sr-only">{stat.label}</dt>
                  <dd>
                    <span className="block font-display text-[clamp(2.4rem,1.4rem+3vw,3.8rem)] font-semibold leading-none tracking-[-0.02em] text-gold-light">
                      {stat.value}
                    </span>
                    <span className="mt-4 flex items-center justify-center gap-2 text-sm text-cream/70">
                      <Icon className="size-4 text-gold-light/90" aria-hidden="true" />
                      {stat.label}
                    </span>
                  </dd>
                </div>
              </Reveal>
            );
          })}
        </dl>
      </div>
    </section>
  );
}

/**
 * Closing invitation over a photograph, with a single primary action.
 */
export function ClosingCta({
  image,
  alt,
  eyebrow,
  title,
  body,
  primaryLabel,
  primaryHref,
  secondaryLabel,
  secondaryHref,
}: {
  image: string;
  alt: string;
  eyebrow: string;
  title: string;
  body: string;
  primaryLabel: string;
  primaryHref: string;
  secondaryLabel?: string;
  secondaryHref?: string;
}) {
  return (
    <section className="surface-dark relative isolate flex min-h-[68svh] items-center justify-center overflow-hidden">
      {/* Untreated photograph; the copy sits directly on it over one localised
          scrim, placed after the image in the DOM. */}
      <Image
        src={image}
        alt={alt}
        fill
        sizes="100vw"
        quality={70}
        className="-z-10 object-cover"
      />
      <div className="photo-scrim -z-10" aria-hidden="true" />
      <div className="on-photo relative mx-auto max-w-3xl px-5 py-28 text-center sm:px-6">
        <Reveal>
          <p className="on-photo-sm text-[11px] font-semibold uppercase tracking-[0.3em] text-gold-light">
            {eyebrow}
          </p>
          <h2 className="mt-7 font-display text-balance text-[clamp(1.85rem,0.9rem+2.7vw,3.2rem)] font-semibold leading-[1.08] tracking-[-0.02em] text-cream">
            {title}
          </h2>
          <p className="mx-auto mt-7 max-w-xl text-[17px] leading-[1.75] text-cream/75">
            {body}
          </p>
          <div className="mt-11 flex flex-col items-stretch justify-center gap-3.5 sm:flex-row sm:items-center sm:gap-4">
            <a href={primaryHref} className="group btn btn-primary btn-lg">
              {primaryLabel}
              <span
                className="transition-transform duration-300 group-hover:translate-x-1"
                aria-hidden="true"
              >
                →
              </span>
            </a>
            {secondaryLabel && secondaryHref && (
              <a href={secondaryHref} className="btn btn-ghost btn-lg">
                {secondaryLabel}
              </a>
            )}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
