"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight,
  Bean,
  Coffee,
  GraduationCap,
  Handshake,
  Landmark,
  Leaf,
  PiggyBank,
  Sprout,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Image from "next/image";
import { LEADERS } from "@/shared/data";
import { fetchHero } from "@/shared/api";
import { useRealtimePoll } from "@/shared/realtime";

type TodayItem = { icon: string; title: string; sub: string };

const TODAY_ICONS: Record<string, LucideIcon> = {
  coffee: Coffee,
  sprout: Sprout,
  piggybank: PiggyBank,
  graduationcap: GraduationCap,
  landmark: Landmark,
  leaf: Leaf,
  users: Users,
  handshake: Handshake,
};

const DEFAULT_BADGES = [
  "Member Focused",
  "Integrity & Transparency",
  "Sustainable Development",
  "Shared Prosperity",
];

const DEFAULT_TODAY_ITEMS: TodayItem[] = [
  {
    icon: "coffee",
    title: "Quality Coffee Collection",
    sub: "Verified lots, openly weighed & graded",
  },
  {
    icon: "sprout",
    title: "Input & Fertilizer Store",
    sub: "DAP, NPK, Urea & organic manure",
  },
  {
    icon: "piggybank",
    title: "SACCO Savings Window",
    sub: "Deposits & affordable member loans",
  },
  {
    icon: "graduationcap",
    title: "Farmers' Training Hub",
    sub: "Good agronomic & climate-smart practice",
  },
];

/**
 * Opening section.
 *
 * Composition is centred by design: the eyebrow, headline, supporting paragraph
 * and both calls to action share one measure and are aligned on a single axis,
 * so the eye lands on the title first and reads outward. The card that used to
 * sit to the right has moved below the fold into `TodayAtCoop` — keeping the
 * same CMS-driven data, but leaving this block uncluttered.
 */
export function Hero() {
  const [headlinePrefix, setHeadlinePrefix] = useState(
    "Empowering Local Farmers through"
  );
  const [headlineHighlight, setHeadlineHighlight] = useState("Quality Coffee");
  const [headlineSuffix, setHeadlineSuffix] = useState(
    "& Sustainable Agriculture"
  );
  const [subtitle, setSubtitle] = useState(
    "Improving member livelihoods through sustainable farming, value addition, and reliable financial services in Kyotera District."
  );
  const [badges, setBadges] = useState<string[]>(DEFAULT_BADGES);
  const [backgroundImage, setBackgroundImage] = useState("/images/farmers.jpg");

  const loadHero = useCallback(async () => {
    const hero = await fetchHero();
    if (!hero) return;
    setHeadlinePrefix(hero.headlinePrefix);
    setHeadlineHighlight(hero.headlineHighlight);
    setHeadlineSuffix(hero.headlineSuffix);
    setSubtitle(hero.subtitle);
    if (hero.badges.length > 0) setBadges(hero.badges);
    if (hero.backgroundImage) setBackgroundImage(hero.backgroundImage);
  }, []);

  useEffect(() => {
    void loadHero();
  }, [loadHero]);

  useRealtimePoll(loadHero, undefined, "hero");

  return (
    <section
      id="home"
      className="surface-dark relative isolate flex min-h-svh items-center overflow-hidden bg-forest-deep py-32 sm:py-36 lg:py-40"
      aria-labelledby="hero-heading"
    >
      {/* The photograph is untouched apart from one localised scrim, and the copy
          sits directly on the picture rather than on a card. The scrim is
          darkest under the headline and fades to fully transparent before the
          frame, so the edges of the photograph stay clean. See `.photo-scrim` in
          globals.css. It is written AFTER the `<Image>` because both are
          absolutely positioned and DOM order alone decides which paints on top. */}
      <div className="absolute inset-0 -z-10" aria-hidden="true">
        <Image
          src={backgroundImage}
          alt=""
          fill
          priority
          sizes="100vw"
          quality={70}
          className="animate-kenburns object-cover"
        />
        <div className="photo-scrim" />
      </div>

      <div className="on-photo relative mx-auto flex w-full max-w-5xl flex-col items-center px-5 text-center sm:px-6">
        <p
          className="on-photo-sm animate-fade-up text-[11px] font-semibold uppercase tracking-[0.34em] text-gold-light sm:text-xs"
          style={{ animationDelay: "60ms" }}
        >
          Kyotera District &middot; Uganda
        </p>

        <div
          className="mt-7 flex animate-fade-up flex-wrap items-center justify-center gap-x-3 gap-y-2"
          style={{ animationDelay: "120ms" }}
        >
          {badges.slice(0, 3).map((badge) => (
            <span
              key={badge}
              className="on-photo-sm inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.16em] text-cream ring-1 ring-white/25"
            >
              <span
                className="size-1.5 rounded-full bg-gold ring-2 ring-gold/25"
                aria-hidden="true"
              />
              {badge}
            </span>
          ))}
        </div>

        <h1
          id="hero-heading"
          className="mt-8 max-w-4xl animate-fade-up font-display text-balance text-[clamp(2.15rem,1rem+5.2vw,4.6rem)] font-semibold leading-[1.06] tracking-[-0.02em] text-cream"
          style={{ animationDelay: "180ms" }}
        >
          {headlinePrefix} <span className="text-gold-light">{headlineHighlight}</span>{" "}
          {headlineSuffix}
        </h1>

        <span
          className="mt-8 block h-px w-20 animate-fade-up bg-gold"
          style={{ animationDelay: "240ms" }}
          aria-hidden="true"
        />

        <p
          className="mt-8 max-w-2xl animate-fade-up text-pretty text-[clamp(1rem,0.5vw+0.9rem,1.15rem)] leading-[1.75] text-cream/85"
          style={{ animationDelay: "300ms" }}
        >
          {subtitle}
        </p>

        <div
          className="mt-11 flex animate-fade-up flex-col items-stretch gap-3.5 sm:flex-row sm:items-center sm:justify-center sm:gap-4"
          style={{ animationDelay: "380ms" }}
        >
          <a href="#services" className="group btn btn-primary btn-lg">
            Explore More
            <ArrowRight
              className="size-4 transition-transform duration-300 group-hover:translate-x-1"
              aria-hidden="true"
            />
          </a>
          <a href="#about" className="btn btn-ghost btn-lg">
            <Users className="size-4" aria-hidden="true" />
            Learn More
          </a>
        </div>

        <div
          className="mt-14 flex animate-fade-up flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-4"
          style={{ animationDelay: "460ms" }}
        >
          <div className="flex -space-x-3">
            {LEADERS.slice(0, 4).map((leader) => (
              <Image
                key={leader.name}
                src={leader.photo}
                alt={`Portrait of ${leader.name}`}
                width={96}
                height={96}
                className="size-10 rounded-full object-cover ring-2 ring-gold/50 transition-transform duration-300 hover:scale-105"
              />
            ))}
          </div>
          <a
            href="#leadership"
            className="group inline-flex items-center gap-1.5 text-sm text-cream/70 transition-colors hover:text-gold-light"
          >
            Member-elected leadership
            <ArrowRight
              className="size-3.5 transition-transform duration-300 group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </a>
        </div>
      </div>

      <a
        href="#about"
        aria-label="Scroll to about section"
        className="on-photo-sm absolute bottom-8 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 text-cream/85 transition-colors hover:text-gold-light md:flex"
      >
        <span className="text-[10px] font-semibold uppercase tracking-[0.28em]">
          Scroll
        </span>
        <span className="relative block h-10 w-[22px] rounded-full border border-current">
          <span
            className="absolute left-1/2 top-1.5 size-1.5 -translate-x-1/2 rounded-full bg-current"
            aria-hidden="true"
          />
        </span>
      </a>
    </section>
  );
}

/**
 * The CMS "Today at the Cooperative" panel, shown as a quiet four-column strip
 * directly below the hero. Same records, no card chrome.
 */
export function TodayAtCoop() {
  const [todayItems, setTodayItems] = useState<TodayItem[]>(DEFAULT_TODAY_ITEMS);

  useEffect(() => {
    const load = async () => {
      const hero = await fetchHero();
      if (hero?.todayItems?.length) setTodayItems(hero.todayItems);
    };
    void load();
  }, []);

  useRealtimePoll(
    useCallback(async () => {
      const hero = await fetchHero();
      if (hero?.todayItems?.length) setTodayItems(hero.todayItems);
    }, []),
    undefined,
    "hero"
  );

  if (todayItems.length === 0) return null;

  return (
    <section
      aria-label="Today at the cooperative"
      className="relative border-y border-forest/10 bg-leaf/60"
    >
      <div className="mx-auto max-w-7xl px-5 py-12 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:gap-12">
          <div className="flex items-center gap-3 lg:shrink-0 lg:pr-4">
            <span className="relative flex size-2" aria-hidden="true">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-brand" />
            </span>
            <h2 className="font-display text-sm font-semibold uppercase tracking-[0.2em] text-forest">
              Open Today
            </h2>
          </div>

          <ul className="grid flex-1 gap-x-8 gap-y-6 sm:grid-cols-2 xl:grid-cols-4">
            {todayItems.map((item) => {
              const Icon = TODAY_ICONS[item.icon] ?? Bean;
              return (
                <li key={item.title} className="flex items-start gap-3">
                  <Icon
                    className="mt-0.5 size-5 shrink-0 text-clay"
                    aria-hidden="true"
                  />
                  <span>
                    <span className="block text-[15px] font-semibold text-forest">
                      {item.title}
                    </span>
                    <span className="mt-0.5 block text-[13px] leading-relaxed text-muted">
                      {item.sub}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
