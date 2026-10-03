"use client";

import {
  Clock,
  ExternalLink,
  MapPin,
  Navigation,
  Phone,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Reveal } from "@/frontend/components/Reveal";
import { SectionHeading } from "@/frontend/components/SectionHeading";
import { CONTACT } from "@/shared/data";
import { fetchLocations, type ApiLocation } from "@/shared/api";
import { useRealtimePoll } from "@/shared/realtime";

export function Location() {
  const [location, setLocation] = useState<ApiLocation | null>(null);

  const load = useCallback(async () => {
    const list = await fetchLocations();
    if (!list || list.length === 0) return;
    setLocation(list.find((loc) => loc.isMainBranch) ?? list[0]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useRealtimePoll(load, undefined, "locations");

  const phones = Array.from(
    new Set([location?.phone, ...CONTACT.phones].filter((p): p is string => Boolean(p)))
  );
  const address = location?.address || CONTACT.address;
  const subCounty = location?.subCounty || "Kalisizo Sub County";
  const district = location?.district || "Kyotera District";
  const mapsUrl =
    location?.latitude != null && location?.longitude != null
      ? `https://www.google.com/maps/search/?api=1&query=${location.latitude},${location.longitude}`
      : CONTACT.mapsUrl;
  const shortMapsUrl = CONTACT.mapsUrl; // https://maps.app.goo.gl/f5Q3ezaYKhCCbGSe9 — real cooperative pin
  const embedUrl =
    location?.latitude != null && location?.longitude != null
      ? `https://www.google.com/maps?q=${location.latitude},${location.longitude}+(Kalisizo+Coffee+Farmers+Cooperative+Society+Ltd)&z=17&hl=en&output=embed`
      : CONTACT.mapsEmbedUrl;
  const coordsLabel =
    location?.latitude != null && location?.longitude != null
      ? `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`
      : `${CONTACT.latitude}, ${CONTACT.longitude}`;
  const dmsLabel = `0°29'39.8"S 31°37'56.4"E`;
  return (
    <section
      id="location"
      className="relative overflow-hidden bg-cream py-28 lg:py-36"
      aria-labelledby="location-heading"
    >
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <SectionHeading
            id="location-heading"
            eyebrow="Cooperative Location | Kyotera District"
            title="Find Us in Kalisizo, Kyotera District"
            description="Visit the registered offices of Kalisizo Coffee Farmers Cooperative Society Ltd: our buying point, input store and SACCO office at the verified pin in Kyotera District, Uganda."
          />
        </Reveal>

        <div className="grid items-stretch gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <Reveal delay={80}>
            <div className="flex h-full flex-col rounded-3xl bg-white p-6 shadow-card ring-1 ring-forest/5 sm:p-8">
              <span className="grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-action to-forest-deep text-cream shadow-card">
                <MapPin className="size-7" aria-hidden="true" />
              </span>
              <h3 className="mt-6 font-display text-2xl font-semibold leading-tight text-forest">
                {location?.name || "Kalisizo Coffee Farmers Cooperative Society Ltd"}
              </h3>
              <p className="mt-1 text-xs font-bold uppercase tracking-wider text-clay">
                Main Office & Buying Point, Kyotera District, Uganda
              </p>
              <address className="mt-5 space-y-4 text-[15px] not-italic leading-relaxed text-muted">
                <a
                  href={shortMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-3 transition-colors hover:text-forest"
                  title="Open verified pin in Google Maps: https://maps.app.goo.gl/f5Q3ezaYKhCCbGSe9"
                >
                  <MapPin className="mt-0.5 size-5 shrink-0 text-clay" aria-hidden="true" />
                  <span>
                    {address}
                    <span className="mt-1 block text-xs text-muted">
                      Kalisizo Sub County · {district}, Uganda
                    </span>
                  </span>
                </a>
                <p className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-forest/5 px-3 py-1.5 font-mono text-forest ring-1 ring-forest/10">
                    <MapPin className="size-3.5 text-clay" aria-hidden="true" />
                    {dmsLabel} · {coordsLabel}
                  </span>
                  <a
                    href={shortMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-clay underline decoration-gold/30 underline-offset-4 hover:text-forest"
                  >
                    {shortMapsUrl.replace("https://", "")}
                  </a>
                </p>
                <p className="flex flex-col gap-1.5">
                  {phones.map((phone) => (
                    <a
                      key={phone}
                      href={`tel:${phone.replace(/\s/g, "")}`}
                      className="flex items-center gap-3 font-semibold text-forest transition-colors hover:text-clay"
                    >
                      <Phone className="size-5 shrink-0 text-clay" aria-hidden="true" />
                      {phone}
                    </a>
                  ))}
                </p>
                <p className="flex items-center gap-3">
                  <Clock className="size-5 shrink-0 text-clay" aria-hidden="true" />
                  Visit during office hours for buying, inputs & savings support.
                </p>
              </address>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <a
                  href={shortMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary btn-md"
                >
                  <Navigation className="size-4" aria-hidden="true" />
                  Get Directions on Google Maps
                </a>
                <a
                  href={`tel:${phones[0].replace(/\s/g, "")}`}
                  className="btn btn-outline btn-md"
                >
                  <Phone className="size-4" aria-hidden="true" />
                  Call the Office
                </a>
              </div>
              <p className="mt-3 text-center text-[11px] leading-relaxed text-muted sm:text-left">
                Verified pin in Kalisizo, Kyotera District, also open via{" "}
                <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-clay hover:text-forest">
                  coordinate search
                </a>
                .
              </p>
            </div>
          </Reveal>

          <Reveal delay={160}>
            <div className="relative h-full min-h-[20rem] overflow-hidden rounded-3xl shadow-card ring-1 ring-forest/10 lg:min-h-[24rem]">
              <iframe
                src={embedUrl}
                title="Kalisizo Coffee Farmers Cooperative Society Ltd, verified location in Kalisizo, Kyotera District, Uganda (−0.4943772, 31.6323331)"
                className="absolute inset-0 size-full border-0"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
              />

              {/* No gradient or tint is laid over the map. The two labels below are
                  floating cards with their own solid backing, so legibility does
                  not depend on the map tiles underneath. */}
              <div className="pointer-events-none absolute left-1/2 top-1/2 mt-10 w-max -translate-x-1/2 rounded-2xl glass-light px-5 py-3 text-center shadow-soft">
                <p className="text-sm font-bold text-forest">
                  Kalisizo Coffee Cooperative
                </p>
                <p className="text-xs font-medium text-muted">
                  {subCounty} · {district}, Uganda
                </p>
                <p className="mt-1 text-[11px] font-mono text-muted">
                  {dmsLabel} · {coordsLabel}
                </p>
              </div>

              <div className="pointer-events-none absolute left-4 top-4 rounded-full bg-forest/80 px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-cream backdrop-blur-sm">
                Live Map · Kyotera District · Verified Pin
              </div>

              <a
                href={shortMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-light absolute bottom-4 right-4"
              >
                Open in Google Maps
                <ExternalLink className="size-4" aria-hidden="true" />
              </a>
            </div>
          </Reveal>
        </div>
      </div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Place",
            name: "Kalisizo Coffee Farmers Cooperative Society Ltd",
            address: {
              "@type": "PostalAddress",
              addressLocality: "Kalisizo",
              addressRegion: "Kyotera District",
              addressCountry: "UG",
            },
            geo: {
              "@type": "GeoCoordinates",
              latitude: -0.4943772,
              longitude: 31.6323331,
            },
            url: mapsUrl,
            hasMap: "https://www.google.com/maps/place/0%C2%B029'39.8%22S+31%C2%B037'56.4%22E/@-0.4943772,31.6323331,17z",
          }),
        }}
      />
    </section>
  );
}