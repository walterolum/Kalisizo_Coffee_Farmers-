"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Error boundary for the public site.
 *
 * Public pages read live data from the database, so a render can fail on a
 * dropped connection or a slow query. Next's built-in error page is rendered
 * outside this layout — no header, no navigation, nothing to click — which turned
 * a transient database blip into a dead end for the visitor.
 *
 * Kept deliberately plain: a plain-language apology, a retry that re-renders the
 * segment, and a route home. The error itself is logged by Next to the server
 * console and is never shown to the visitor, so nothing about the database,
 * the query or the stack reaches the page.
 */
export default function SiteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Server-side only in intent; this is the client component that Next pairs
    // with the error, and logging here is what puts the real cause in the logs
    // an operator actually reads.
    console.error("[site] render failed:", error);
  }, [error]);

  return (
    <section className="surface-dark relative overflow-hidden bg-forest-deep py-32 sm:py-40">
      <div
        className="absolute -top-24 right-0 h-80 w-80 rounded-full bg-gold/10 blur-3xl"
        aria-hidden="true"
      />
      <div className="relative mx-auto max-w-2xl px-4 text-center sm:px-6 lg:px-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-gold-light">
          Something went wrong
        </p>

        <h1 className="mt-7 font-display text-balance text-[clamp(2rem,1.1rem+3.2vw,3.5rem)] font-semibold leading-[1.08] tracking-tight text-cream">
          We could not load this page
        </h1>

        <p className="mx-auto mt-7 max-w-xl text-pretty text-[clamp(1rem,0.4vw+0.92rem,1.125rem)] leading-[1.75] text-cream/75">
          This is a problem on our side, not yours. Trying again usually resolves it.
          If it keeps happening, please let us know.
        </p>

        <div className="mt-11 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center justify-center rounded-full bg-gold px-7 py-3 text-sm font-semibold text-coffee transition-colors hover:bg-gold-light"
          >
            Try again
          </button>
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-full border border-cream/25 px-7 py-3 text-sm font-semibold text-cream transition-colors hover:border-gold hover:text-gold-light"
          >
            Back to home
          </Link>
          <Link
            href="/contact"
            className="inline-flex items-center justify-center rounded-full border border-cream/25 px-7 py-3 text-sm font-semibold text-cream transition-colors hover:border-gold hover:text-gold-light"
          >
            Report a problem
          </Link>
        </div>
      </div>
    </section>
  );
}
