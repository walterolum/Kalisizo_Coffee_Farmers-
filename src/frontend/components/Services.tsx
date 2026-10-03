"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowUpRight,
  Check,
  Coffee,
  FlaskConical,
  GraduationCap,
  Landmark,
  Leaf,
  PiggyBank,
  Recycle,
  Sparkles,
  Sprout,
  Users,
  Wheat,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Image from "next/image";
import { Reveal } from "@/frontend/components/Reveal";
import { SectionHeading } from "@/frontend/components/SectionHeading";
import { SERVICES } from "@/shared/data";
import { fetchServices } from "@/shared/api";
import { useRealtimePoll } from "@/shared/realtime";

type ServiceItem = {
  id: string;
  title: string;
  tagline: string;
  points: string[];
  details: string[];
  icon: string | LucideIcon;
};

const SERVICE_ICONS: Record<string, LucideIcon> = {
  coffee: Coffee,
  flask: FlaskConical,
  piggybank: PiggyBank,
  graduationcap: GraduationCap,
  landmark: Landmark,
  leaf: Leaf,
  users: Users,
  wheat: Wheat,
  recycle: Recycle,
  sprout: Sprout,
};

function resolveIcon(icon: string | LucideIcon): LucideIcon {
  return typeof icon === "string" ? (SERVICE_ICONS[icon] ?? Coffee) : icon;
}

export function Services() {
  const [services, setServices] = useState<ServiceItem[]>(SERVICES);
  const [activeId, setActiveId] = useState<string>(SERVICES[0].id);
  const active = services.find((s) => s.id === activeId) ?? services[0];

  const load = useCallback(async () => {
    const list = await fetchServices();
    if (!list || list.length === 0) return;
    setServices(
      list.map((s) => ({
        id: s.id,
        title: s.title,
        tagline: s.tagline,
        points: s.points,
        details: s.details,
        icon: s.icon ?? "coffee",
      }))
    );
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useRealtimePoll(load, undefined, "services");

  return (
    <section
      id="services"
      className="relative overflow-hidden bg-leaf py-28 lg:py-36"
      aria-labelledby="services-heading"
    >
      <div
        className="absolute -left-32 top-24 h-72 w-72 rounded-full bg-brand/10 blur-3xl"
        aria-hidden="true"
      />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <SectionHeading
            id="services-heading"
            eyebrow="What We Offer"
            title="Core Pillars & Services"
            description="Four connected pillars that boost farm yields, incomes and financial security for every member."
          />
        </Reveal>

        <div className="grid gap-8 sm:grid-cols-2 xl:grid-cols-4 xl:gap-10">
          {services.map((service, i) => (
            <Reveal key={service.id} delay={i * 80} as="div">
              <button
                type="button"
                onClick={() => setActiveId(service.id)}
                aria-pressed={active.id === service.id}
                aria-label={`View details about ${service.title}`}
                className={`group flex h-full w-full flex-col border-t-2 pt-6 text-left transition-colors duration-300 ${
                  active.id === service.id
                    ? `border-gold`
                    : "border-forest/12 hover:border-gold/60"
                }`}
              >
                {(() => {
                  const Icon = resolveIcon(service.icon);
                  return (
                    // A single solid disc rather than a per-service gradient
                    // tile: the accent pairs are muted earth tones, but four
                    // different fills in one row read as decoration rather than
                    // as a system, and `from-*`/`to-*` do nothing without a
                    // gradient background anyway.
                    <span className="grid size-12 place-items-center rounded-full bg-forest text-gold-light transition-transform duration-500 group-hover:scale-105">
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                  );
                })()}
                <h3 className="mt-6 font-display text-xl font-semibold text-forest">
                  {service.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {service.tagline}
                </p>
                <ul className="mt-5 space-y-2.5">
                  {service.points.map((point) => (
                    <li
                      key={point}
                      className="flex items-start gap-2 text-[13.5px] leading-snug text-muted"
                    >
                      <Check
                        className="mt-0.5 size-3.5 shrink-0 text-clay"
                        aria-hidden="true"
                      />
                      {point}
                    </li>
                  ))}
                </ul>
                <span
                  className={`mt-6 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wider transition-colors ${
                    active.id === service.id ? "bg-gold/25 text-coffee" : "text-muted"
                  }`}
                >
                  <Sparkles className="size-3.5" aria-hidden="true" />
                  {active.id === service.id ? "Showing details below" : "Tap to explore"}
                </span>
              </button>
            </Reveal>
          ))}
        </div>

        <Reveal delay={120}>
          {/* Untreated photograph with the copy set directly on it - no panel, no
              blur. One scrim sits behind the text and is clipped by the card; it
              is written after the `<Image>` so it paints on top. The sub-card on
              the right keeps its own ring because it holds a button rather than a
              heading. */}
          <div
            className="surface-dark mt-6 overflow-hidden rounded-3xl bg-forest"
            aria-live="polite"
          >
            <div className="relative" key={active.id}>
              <div className="pointer-events-none absolute inset-0" aria-hidden="true">
                <Image
                  src="/pictures/nursery-beds.jpg"
                  alt=""
                  fill
                  sizes="100vw"
                  quality={50}
                  className="object-cover"
                />
                <div className="photo-scrim-panel" />
              </div>
              <div className="on-photo relative px-6 py-8 sm:px-10">
                <p className="on-photo-sm text-[11px] font-bold uppercase tracking-[0.22em] text-gold-light">
                  How it works: {active.title}
                </p>
                <div className="relative mt-5 grid gap-6 md:grid-cols-2">
                <ul className="space-y-3.5">
                  {active.details.map((detail, i) => (
                    <li
                      key={detail}
                      className="flex items-start gap-3 text-[15px] leading-relaxed text-cream/90"
                    >
                      <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-gold text-[11px] font-bold text-coffee">
                        {i + 1}
                      </span>
                      {detail}
                    </li>
                  ))}
                </ul>
                {/* No fill: the photograph reads through this card, which is marked
                    by a ring alone. */}
                <div className="flex flex-col justify-between gap-6 rounded-2xl p-6 ring-1 ring-white/30">
                  <p className="text-sm leading-relaxed text-cream/85">
                    Every pillar is delivered with the cooperative values of{" "}
                    <span className="on-photo-sm font-semibold text-gold-light">
                      transparency, fairness and respect
                    </span>{" "}
                    putting members first at every step.
                  </p>
                  <a
                    href="#contact"
                    className="btn btn-light btn-md w-fit"
                  >
                    Talk to the Team
                    <ArrowUpRight className="size-4" aria-hidden="true" />
                  </a>
                </div>
              </div>
            </div>
          </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}