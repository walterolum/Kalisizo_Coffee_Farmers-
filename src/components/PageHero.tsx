import Link from "next/link";
import type { ReactNode } from "react";
import { Reveal } from "@/components/Reveal";

type PageHeroProps = {
  eyebrow: string;
  title: string;
  description?: string;
  /** Optional breadcrumb trail, excluding the home link which is automatic. */
  trail?: { label: string; href: string }[];
};

/**
 * Shared banner for the top of every inner page. Keeping it in one place means
 * the eyebrow/title/description rhythm and the padding are identical across the
 * site, and every page gets a single clear `h1`.
 */
export function PageHero({ eyebrow, title, description, trail }: PageHeroProps) {
  return (
    <section className="relative overflow-hidden bg-forest-deep pb-16 pt-36 sm:pb-20 sm:pt-44">
      <div
        className="absolute -top-24 right-0 h-80 w-80 rounded-full bg-gold/10 blur-3xl"
        aria-hidden="true"
      />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <nav aria-label="Breadcrumb" className="mb-6">
            <ol className="flex flex-wrap items-center gap-1.5 text-[13px] text-cream/55">
              <li>
                <Link href="/" className="transition-colors hover:text-gold-light">
                  Home
                </Link>
              </li>
              {trail?.map((crumb) => (
                <li key={crumb.href} className="flex items-center gap-1.5">
                  <span aria-hidden="true">/</span>
                  <Link href={crumb.href} className="transition-colors hover:text-gold-light">
                    {crumb.label}
                  </Link>
                </li>
              ))}
              <li className="flex items-center gap-1.5">
                <span aria-hidden="true">/</span>
                <span aria-current="page" className="text-cream/80">
                  {title}
                </span>
              </li>
            </ol>
          </nav>

          <span className="inline-flex items-center gap-2 rounded-full bg-white/8 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-gold-light ring-1 ring-white/10">
            {eyebrow}
          </span>
          <h1 className="mt-6 max-w-4xl font-display text-balance text-[clamp(2rem,1.1rem+3.2vw,3.75rem)] font-semibold leading-[1.08] tracking-tight text-cream">
            {title}
          </h1>
          <span
            className="mt-6 block h-1 w-16 rounded-full bg-gold"
            aria-hidden="true"
          />
          {description && (
            <p className="mt-6 max-w-2xl text-[clamp(1rem,0.4vw+0.92rem,1.15rem)] leading-relaxed text-cream/70">
              {description}
            </p>
          )}
        </Reveal>
      </div>
    </section>
  );
}

type EmptyStateProps = {
  title: string;
  description: string;
  children?: ReactNode;
};

/** Shown when a filtered list legitimately has no results. */
export function EmptyState({ title, description, children }: EmptyStateProps) {
  return (
    <div className="rounded-3xl border border-dashed border-charcoal/15 bg-white/60 px-6 py-16 text-center">
      <h2 className="font-display text-xl font-semibold text-forest">{title}</h2>
      <p className="mx-auto mt-3 max-w-md text-charcoal/60">{description}</p>
      {children && <div className="mt-6 flex justify-center">{children}</div>}
    </div>
  );
}
