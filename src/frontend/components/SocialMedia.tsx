"use client";

import { ExternalLink, Globe } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Reveal } from "@/frontend/components/Reveal";
import { SectionHeading } from "@/frontend/components/SectionHeading";
import { fetchSettings, type ApiSettings } from "@/shared/api";
import { resolveSocials, socialTarget } from "@/shared/social-design";
import { useRealtimePoll } from "@/shared/realtime";

export function SocialMedia() {
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

  // Whatever the CMS publishes, in its order. A platform added in the admin
  // appears here on the next poll without touching this file.
  const socials = resolveSocials(settings?.socials);

  return (
    <section
      id="social"
      className="relative overflow-hidden bg-forest py-28 lg:py-36"
      aria-labelledby="social-heading"
    >
      <div
        className="absolute -left-32 -top-24 h-80 w-80 rounded-full bg-emerald-brand/40 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-gold/15 blur-3xl"
        aria-hidden="true"
      />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <SectionHeading
            id="social-heading"
            tone="dark"
            eyebrow="Follow The Journey"
            title="Connect With Us Online"
            description="Farm stories, harvest updates and cooperative news on our official platforms."
          />
        </Reveal>

        <div className="grid gap-6 md:grid-cols-3">
          {socials.map((social, i) => (
            <Reveal key={social.key} delay={i * 90} as="div">
              <a
                href={social.url}
                {...socialTarget(social.url)}
                className={`group flex h-full flex-col bg-white/5 p-6 ring-1 ring-white/10 transition-colors duration-300 hover:bg-white/10 hover:ring-gold/40 sm:p-7 ${social.hover}`}
              >
                <span
                  className={`grid size-12 place-items-center rounded-full ${social.tile} transition-transform duration-500 group-hover:scale-105`}
                >
                  <social.icon className="size-5" aria-hidden="true" />
                </span>
                <h3 className="mt-6 font-display text-xl font-semibold text-cream">
                  {social.platform}
                </h3>
                <p className="mt-1 text-sm font-bold text-gold-light">
                  {social.handle}
                </p>
                <p className="mt-3 flex-1 text-sm leading-relaxed text-cream/70">
                  {social.description}
                </p>
                <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-bold text-cream transition-colors group-hover:text-gold-light">
                  {social.url.startsWith("mailto:") ? "Write to us" : "Follow us"}
                  <ExternalLink
                    className="size-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                    aria-hidden="true"
                  />
                </span>
              </a>
            </Reveal>
          ))}
        </div>

        <Reveal delay={120}>
          <p className="mt-10 flex items-center justify-center gap-2 text-center text-sm text-cream/60">
            <Globe className="size-4 text-gold" aria-hidden="true" />
            Official pages run as “Kalisizo Coffee Farmers Cooperative Society
            Ltd”, farm family to farm family.
          </p>
        </Reveal>
      </div>
    </section>
  );
}