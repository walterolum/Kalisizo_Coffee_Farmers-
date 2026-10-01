import Link from "next/link";
import Image from "next/image";
import { ArrowRight, CalendarDays, MapPin } from "lucide-react";

/** Small helpers shared by the public content cards. */

const DATE_FORMAT = new Intl.DateTimeFormat("en-UG", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const DATETIME_FORMAT = new Intl.DateTimeFormat("en-UG", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return DATE_FORMAT.format(date);
}

export function formatDateTime(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return DATETIME_FORMAT.format(date);
}

/**
 * Display label for a project stage.
 *
 * Shared deliberately: the detail page has its own copy of this map, and the two
 * used to disagree — the listing rendered the raw enum (`ONGOING`) while the
 * detail page rendered `Ongoing`. The detail route imports `formatStage` so both
 * read from one definition.
 */
const STAGE_LABEL: Record<string, string> = {
  PLANNED: "Planned",
  ONGOING: "Ongoing",
  COMPLETED: "Completed",
};

export function formatStage(stage: string): string {
  return STAGE_LABEL[stage] ?? stage.replace(/_/g, " ");
}

/** Human-readable file size for the downloads list. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

type CardShellProps = {
  href: string;
  children: React.ReactNode;
  className?: string;
};

/**
 * Wraps a card in a single stretched link so the whole card is clickable while
 * the accessible name stays the card's own heading.
 */
function CardShell({ href, children, className = "" }: CardShellProps) {
  return (
    <article
      className={`group relative flex h-full flex-col overflow-hidden rounded-2xl bg-white ring-1 ring-charcoal/8 transition-colors duration-300 hover:ring-gold/40 ${className}`}
    >
      {children}
      <Link href={href} className="absolute inset-0 z-10" aria-label="Read more">
        <span className="sr-only">Read more</span>
      </Link>
    </article>
  );
}

export function NewsCard({
  href,
  title,
  excerpt,
  imageUrl,
  imageAlt,
  publishedAt,
  category,
}: {
  href: string;
  title: string;
  excerpt: string;
  imageUrl: string | null;
  imageAlt: string | null;
  publishedAt: Date | null;
  category: string | null;
}) {
  return (
    <CardShell href={href}>
      {imageUrl && (
        <div className="relative aspect-[16/10] overflow-hidden bg-charcoal/5">
          <Image
            src={imageUrl}
            alt={imageAlt || ""}
            fill
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            quality={65}
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        </div>
      )}
      <div className="flex flex-1 flex-col p-6">
        <div className="flex flex-wrap items-center gap-3 text-[11px] font-bold uppercase tracking-[0.16em] text-gold-deep">
          {category && <span>{category}</span>}
          {publishedAt && (
            <time dateTime={publishedAt.toISOString()} className="text-charcoal/45">
              {formatDate(publishedAt)}
            </time>
          )}
        </div>
        <h3 className="mt-3 font-display text-lg font-semibold leading-snug text-forest">
          {title}
        </h3>
        <p className="mt-3 line-clamp-3 flex-1 text-sm leading-relaxed text-charcoal/65">
          {excerpt}
        </p>
        <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-bold text-forest">
          Read article
          <ArrowRight
            className="size-4 transition-transform duration-300 group-hover:translate-x-1"
            aria-hidden="true"
          />
        </span>
      </div>
    </CardShell>
  );
}

export function ProjectCard({
  href,
  title,
  summary,
  imageUrl,
  imageAlt,
  location,
  stage,
}: {
  href: string;
  title: string;
  summary: string;
  imageUrl: string | null;
  imageAlt: string | null;
  location: string | null;
  stage: string;
}) {
  return (
    <CardShell href={href}>
      {imageUrl && (
        <div className="relative aspect-[16/10] overflow-hidden bg-charcoal/5">
          <Image
            src={imageUrl}
            alt={imageAlt || ""}
            fill
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            quality={65}
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        </div>
      )}
      <div className="flex flex-1 flex-col p-6">
        <span className="inline-flex w-fit items-center rounded-full bg-emerald-brand/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-brand">
          {formatStage(stage)}
        </span>
        <h3 className="mt-3 font-display text-lg font-semibold leading-snug text-forest">
          {title}
        </h3>
        <p className="mt-3 line-clamp-3 flex-1 text-sm leading-relaxed text-charcoal/65">
          {summary}
        </p>
        {location && (
          <p className="mt-4 flex items-center gap-1.5 text-[13px] text-charcoal/50">
            <MapPin className="size-3.5 shrink-0 text-gold-deep" aria-hidden="true" />
            {location}
          </p>
        )}
      </div>
    </CardShell>
  );
}

export function EventCard({
  href,
  title,
  summary,
  startAt,
  location,
  isPast,
}: {
  href: string;
  title: string;
  summary: string;
  startAt: Date;
  location: string | null;
  /** Passed in rather than derived here: reading the clock during render is impure. */
  isPast: boolean;
}) {
  const upcoming = !isPast;
  return (
    <CardShell href={href}>
      <div className="flex items-stretch gap-0">
        <div className="flex w-24 shrink-0 flex-col items-center justify-center bg-forest px-3 py-6 text-center">
          <span className="font-display text-3xl font-semibold leading-none text-gold-light">
            {startAt.getDate()}
          </span>
          <span className="mt-1 text-[11px] font-bold uppercase tracking-[0.16em] text-cream/70">
            {new Intl.DateTimeFormat("en-UG", { month: "short" }).format(startAt)}
          </span>
          <span className="mt-0.5 text-[11px] text-cream/50">
            {startAt.getFullYear()}
          </span>
        </div>
        <div className="flex flex-1 flex-col p-5">
          <span
            className={`inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] ${
              upcoming
                ? "bg-emerald-brand/12 text-emerald-brand"
                : "bg-charcoal/8 text-charcoal/60"
            }`}
          >
            {upcoming ? "Upcoming" : "Past"}
          </span>
          <h3 className="mt-2.5 font-display text-base font-semibold leading-snug text-forest">
            {title}
          </h3>
          <p className="mt-2 line-clamp-2 flex-1 text-sm leading-relaxed text-charcoal/60">
            {summary}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-charcoal/50">
            <span className="flex items-center gap-1.5">
              <CalendarDays className="size-3.5 shrink-0 text-gold-deep" aria-hidden="true" />
              {formatDateTime(startAt)}
            </span>
            {location && (
              <span className="flex min-w-0 items-center gap-1.5">
                <MapPin className="size-3.5 shrink-0 text-gold-deep" aria-hidden="true" />
                <span className="truncate">{location}</span>
              </span>
            )}
          </div>
        </div>
      </div>
    </CardShell>
  );
}
