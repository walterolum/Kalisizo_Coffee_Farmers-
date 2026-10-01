"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { BRAND } from "@/lib/data";
import { fetchSettings } from "@/lib/api";
import { useRealtimePoll } from "@/lib/realtime";

const FALLBACK_LOGO = "/images/logo-light.png";

export function Logo() {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    const info = await fetchSettings();
    if (!info) return;
    setLogoUrl(info.logoUrl || FALLBACK_LOGO);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useRealtimePoll(load, undefined, "settings");

  const src = logoUrl || FALLBACK_LOGO;

  return (
    // `next/link`, not a raw anchor: the logo appears in the header and the
    // footer of every public page, so a hard navigation would throw away the
    // page. The previous `href="#home"` only resolved on the home page —
    // `id="home"` lives on the hero — so on the other ten it was a dead link
    // whose accessible name still promised "home".
    <Link
      href="/"
      className="group inline-flex items-center gap-3 rounded-lg"
      aria-label={`${BRAND.name} home`}
    >
      <span className="relative size-11 shrink-0 overflow-hidden sm:size-12">
        <Image
          src={src}
          alt={`${BRAND.name} logo`}
          fill
          sizes="48px"
          className="object-contain"
        />
      </span>
      <span className="hidden font-display text-lg font-semibold tracking-tight text-cream transition-colors duration-300 group-hover:text-gold-light sm:block sm:text-xl">
        Kalisizo Coffee Farmers
      </span>
    </Link>
  );
}