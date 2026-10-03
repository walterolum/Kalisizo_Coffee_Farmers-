import type { Metadata } from "next";
import Link from "next/link";

/**
 * 404 page for the public site.
 *
 * Five route families call `notFound()` — `/news/[slug]`, `/projects/[slug]`,
 * `/events/[slug]`, `/programs/[slug]` and `/p/[slug]` — plus any URL that simply
 * does not exist. Without this file Next served its own bare "This page could not
 * be found" document: no header, no navigation, no way back into the site. A
 * visitor who mistyped a link or followed a stale one was stuck.
 *
 * This lives in the `(site)` group so it renders inside the normal header and
 * footer, and inherits the group's `force-dynamic` rendering.
 *
 * `robots` keeps a soft-404 out of the index: a missing page should not be
 * crawled as though it had content.
 */

export const metadata: Metadata = {
  title: "Page not found",
  description:
    "That page could not be found. Browse our news, programs, products and gallery instead.",
  robots: { index: false, follow: true },
};

const SUGGESTIONS = [
  { label: "Home", href: "/" },
  { label: "Programs", href: "/programs" },
  { label: "News", href: "/news" },
  { label: "Products", href: "/products" },
  { label: "Gallery", href: "/gallery" },
  { label: "Contact us", href: "/contact" },
];

export default function NotFound() {
  return (
    <section className="surface-dark relative overflow-hidden bg-forest-deep py-32 sm:py-40">
      <div
        className="absolute -top-24 right-0 h-80 w-80 rounded-full bg-gold/10 blur-3xl"
        aria-hidden="true"
      />
      <div className="relative mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-gold-light">
          Error 404
        </p>

        <h1 className="mt-7 font-display text-balance text-[clamp(2.25rem,1.2rem+3.6vw,4rem)] font-semibold leading-[1.08] tracking-tight text-cream">
          We could not find that page
        </h1>

        <p className="mx-auto mt-7 max-w-xl text-pretty text-[clamp(1rem,0.4vw+0.92rem,1.125rem)] leading-[1.75] text-cream/75">
          The page may have been moved, or the link that brought you here may be out
          of date. Everything the cooperative publishes is reachable from the links
          below.
        </p>

        <div className="mt-11 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-full bg-gold px-7 py-3 text-sm font-semibold text-coffee transition-colors hover:bg-gold-light"
          >
            Back to home
          </Link>
          <Link
            href="/contact"
            className="inline-flex items-center justify-center rounded-full border border-cream/25 px-7 py-3 text-sm font-semibold text-cream transition-colors hover:border-gold hover:text-gold-light"
          >
            Contact us
          </Link>
        </div>

        <nav aria-label="Suggested pages" className="mt-12 border-t border-cream/10 pt-8">
          <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm">
            {SUGGESTIONS.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="text-cream/70 underline-offset-4 transition-colors hover:text-gold-light hover:underline"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </section>
  );
}
