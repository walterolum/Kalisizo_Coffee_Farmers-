"use client";

import { Bean } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { TAGLINES } from "@/lib/data";
import { fetchSettings } from "@/lib/api";
import { useRealtimePoll } from "@/lib/realtime";

export function Marquee() {
  const [taglines, setTaglines] = useState<string[]>(TAGLINES);

  const load = useCallback(async () => {
    const info = await fetchSettings();
    if (!info || !info.taglines || info.taglines.length === 0) return;
    setTaglines(info.taglines);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useRealtimePoll(load, undefined, "settings");

  const items = [...taglines, ...taglines];
  return (
    <div
      className="relative overflow-hidden border-y border-gold/20 bg-forest-deep py-4"
      aria-hidden="true"
    >
      <div className="flex w-max animate-marquee marquee-track">
        <div className="flex shrink-0 items-center gap-14 whitespace-nowrap pr-14">
          {items.map((t, i) => (
            <span
              key={i}
              className="flex items-center gap-3 text-sm font-medium tracking-wide uppercase text-cream/75"
            >
              <Bean className="size-3.5 text-gold" />
              {t}
            </span>
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-14 whitespace-nowrap pr-14">
          {items.map((t, i) => (
            <span
              key={`b-${i}`}
              className="flex items-center gap-3 text-sm font-medium tracking-wide uppercase text-cream/75"
            >
              <Bean className="size-3.5 text-gold" />
              {t}
            </span>
          ))}
        </div>
      </div>
      <div
        className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-forest-deep to-transparent"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-forest-deep to-transparent"
        aria-hidden="true"
      />
    </div>
  );
}