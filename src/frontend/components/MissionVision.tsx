"use client";

import { Eye, HeartHandshake, Quote, Target } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { Reveal } from "@/frontend/components/Reveal";
import { SectionHeading } from "@/frontend/components/SectionHeading";
import { BRAND, MISSION_POINTS, VISION_POINTS } from "@/shared/data";
import { fetchSettings, type ApiSettings } from "@/shared/api";
import { useRealtimePoll } from "@/shared/realtime";

export function MissionVision() {
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

  const mission = settings?.mission;
  const vision = settings?.vision;
  const motto = settings?.taglines?.[1] || BRAND.motto;
  const valuesLine = settings?.taglines?.[0] || BRAND.values[0];
  return (
    <section
      id="about"
      className="relative overflow-hidden bg-cream py-28 lg:py-36"
      aria-labelledby="mv-heading"
    >
      <div
        className="absolute -right-40 top-10 h-80 w-80 rounded-full bg-gold/10 blur-3xl"
        aria-hidden="true"
      />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <SectionHeading
            id="mv-heading"
            eyebrow="Who We Are"
            title="Our Mission & Vision"
            description="A member-first cooperative built on transparency, fair trade and sustainable coffee production."
          />
        </Reveal>

        {/* Mission and Vision read as one continuous statement split by a
            hairline, rather than two equal white cards. Side-by-side panels of
            identical weight made this section look like a dashboard instead of
            the editorial spread it is meant to be. */}
        <div className="grid gap-12 lg:grid-cols-[1fr_auto_1fr] lg:gap-16">
          <Reveal delay={80}>
            <div className="h-full">
              <span className="grid size-12 place-items-center rounded-full bg-forest text-gold-light">
                <Target className="size-5" aria-hidden="true" />
              </span>
              <p className="mt-7 text-[11px] font-semibold uppercase tracking-[0.3em] text-clay">
                Our Mission
              </p>
              <p className="mt-6 text-pretty text-[clamp(1.0625rem,0.3vw+1rem,1.25rem)] leading-[1.7] text-muted">
                {mission ?? (
                  <>
                    To strengthen members&apos; cooperation through{" "}
                    <strong className="font-semibold text-forest">
                      increased incomes
                    </strong>{" "}
                    &amp; promoting a{" "}
                    <strong className="font-semibold text-forest">
                      sustainable coffee environment
                    </strong>
                    .
                  </>
                )}
              </p>
              <ul className="mt-8 space-y-3">
                {MISSION_POINTS.map((point) => (
                  <li
                    key={point}
                    className="flex items-start gap-3 text-[15px] leading-relaxed text-muted"
                  >
                    <span className="mt-2 size-1 shrink-0 rounded-full bg-gold" aria-hidden="true" />
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>

          <div
            className="hidden w-px bg-forest/15 lg:block"
            aria-hidden="true"
          />

          <Reveal delay={160}>
            <div className="h-full">
              <span className="grid size-12 place-items-center rounded-full bg-forest text-gold-light">
                <Eye className="size-5" aria-hidden="true" />
              </span>
              <p className="mt-7 text-[11px] font-semibold uppercase tracking-[0.3em] text-clay">
                Our Vision
              </p>
              <p className="mt-6 text-pretty text-[clamp(1.0625rem,0.3vw+1rem,1.25rem)] leading-[1.7] text-muted">
                {vision ?? (
                  <>
                    A sustainable coffee farming cooperative that serves its
                    members with{" "}
                    <strong className="font-semibold text-forest">fairness</strong>.
                  </>
                )}
              </p>
              <ul className="mt-8 space-y-3">
                {VISION_POINTS.map((point) => (
                  <li
                    key={point}
                    className="flex items-start gap-3 text-[15px] leading-relaxed text-muted"
                  >
                    <span className="mt-2 size-1 shrink-0 rounded-full bg-gold" aria-hidden="true" />
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>

        <Reveal delay={120}>
                      {/* The quote is set directly on the photograph - no panel. One
              localised scrim sits behind the type and fades out before the
              card edge, written after the `<Image>` so it paints on top. */}
          <div className="surface-dark relative mt-20 overflow-hidden rounded-3xl bg-forest px-5 py-14 sm:px-12 sm:py-16">
            <div className="absolute inset-0" aria-hidden="true">
              <Image
                src="/pictures/coffee-farms.jpg"
                alt=""
                fill
                sizes="100vw"
                quality={65}
                className="object-cover"
              />
              <div className="photo-scrim" />
            </div>
            <div className="on-photo relative mx-auto max-w-3xl text-center">
              <Quote
                className="on-photo-sm mx-auto size-12 text-gold-light"
                aria-hidden="true"
              />
              <p className="mt-4 font-display text-2xl font-semibold leading-snug text-cream sm:text-4xl">
                {motto}
              </p>
              <p className="on-photo-sm mx-auto mt-5 inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-gold-light">
                <HeartHandshake className="size-4" aria-hidden="true" />
                {valuesLine}
              </p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}