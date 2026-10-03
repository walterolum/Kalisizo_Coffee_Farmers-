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
  /** Used for the stretched link's accessible name. See CardShell. */
  title: string;
  children: React.ReactNode;
  className?: string;
};

/**
 * Image well shared by the news and project cards.
 *
 * The photograph is shown as-is: no gradient, scrim or tint is placed over it.
 * That is a site-wide rule, so a card image reads as a photograph rather than as
 * a coloured panel.
 *
 * The leaf fill behind it is the placeholder while a CMS image is missing, and
 * shows as a hairline of colour once the photo loads.
 */
function CardImage({
  src,
  alt,
  sizes,
}: {
  src: string;
  alt: string;
  sizes: string;
}) {
  return (
    <div className="relative aspect-[16/10] overflow-hidden bg-leaf">
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        quality={65}
        className="object-cover transition-transform duration-500 group-hover:scale-105"
      />
    </div>
  );
}

/**
 * Wraps a card in a single stretched link so the whole card is clickable while
 * the accessible name stays the card's own heading.
 *
 * The name is built from the card's `title` rather than a literal "Read more".
 * The stretched link covers the card and has no text content of its own, so
 * without `aria-label` a screen reader announcing it has nothing to fall back
 * on; with a constant label, every card on the site was announced identically and
 * a user tabbing through /news heard "Read more, link, Read more, link" with no
 * way to tell them apart. WCAG 2.4.4, and 2.5.3 for the visible-name mismatch.
 */
function CardShell({ href, title, children, className = "" }: CardShellProps) {
  const label = `Read more about ${title}`;
  return (
    <article
      className={`group relative flex h-full flex-col overflow-hidden rounded-2xl bg-white ring-1 ring-coffee/8 transition-colors duration-300 hover:ring-gold/40 ${className}`}
    >
      {children}
      <Link href={href} className="absolute inset-0 z-10" aria-label={label}>
        <span className="sr-only">{label}</span>
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
    <CardShell href={href} title={title}>
      {imageUrl && (
        <CardImage
          src={imageUrl}
          alt={imageAlt || ""}
          sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
        />
      )}
      <div className="flex flex-1 flex-col p-6">
        <div className="flex flex-wrap items-center gap-3 text-[11px] font-bold uppercase tracking-[0.16em]">
          {/* Gold chip, coffee label. Gold is a fill in this palette and never
              text; coffee on gold/20 measures 10.8:1 here. */}
          {category && (
            <span className="rounded-full bg-gold/20 px-2.5 py-1 text-coffee">
              {category}
            </span>
          )}
          {publishedAt && (
            <time dateTime={publishedAt.toISOString()} className="text-muted">
              {formatDate(publishedAt)}
            </time>
          )}
        </div>
        <h3 className="mt-3 font-display text-lg font-semibold leading-snug text-coffee">
          {title}
        </h3>
        <p className="mt-3 line-clamp-3 flex-1 text-sm leading-relaxed text-muted">
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
    <CardShell href={href} title={title}>
      {imageUrl && (
        <CardImage
          src={imageUrl}
          alt={imageAlt || ""}
          sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
        />
      )}
      <div className="flex flex-1 flex-col p-6">
        {/* Forest label on a leaf chip: 8.65:1. The previous green text measured
            4.39:1 on leaf and failed 4.5:1. */}
        <span className="inline-flex w-fit items-center rounded-full bg-leaf px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-forest">
          {formatStage(stage)}
        </span>
        <h3 className="mt-3 font-display text-lg font-semibold leading-snug text-coffee">
          {title}
        </h3>
        <p className="mt-3 line-clamp-3 flex-1 text-sm leading-relaxed text-muted">
          {summary}
        </p>
        {location && (
          <p className="mt-4 flex items-center gap-1.5 text-[13px] text-muted">
            <MapPin className="size-3.5 shrink-0 text-clay" aria-hidden="true" />
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
    <CardShell href={href} title={title}>
      <div className="flex items-stretch gap-0">
        {/* Gradient date block. Gold-light on forest 5.76:1 and on forest-deep
            7.24:1; the month and year are cream/70 (5.44:1 on forest), which is
            the lowest surviving alpha step - cream/50 was 3.4:1 and failed. */}
        <div className="relative flex w-24 shrink-0 flex-col items-center justify-center bg-gradient-to-br from-forest to-forest-deep px-3 py-6 text-center">
          <span
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-gold to-brand"
          />
          <span className="font-display text-3xl font-semibold leading-none text-gold-light">
            {startAt.getDate()}
          </span>
          <span className="mt-1 text-[11px] font-bold uppercase tracking-[0.16em] text-cream/70">
            {new Intl.DateTimeFormat("en-UG", { month: "short" }).format(startAt)}
          </span>
          <span className="mt-0.5 text-[11px] text-cream/70">
            {startAt.getFullYear()}
          </span>
        </div>
        {/* Leaf-tinted body panel against the white card, so the two halves of
            the row read as one designed block rather than a white box. */}
        <div className="flex flex-1 flex-col bg-leaf/45 p-5">
          <span
            className={`inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] ${
              upcoming ? "bg-brand/20 text-forest" : "bg-coffee/8 text-muted"
            }`}
          >
            {upcoming ? "Upcoming" : "Past"}
          </span>
          <h3 className="mt-2.5 font-display text-base font-semibold leading-snug text-coffee">
            {title}
          </h3>
          <p className="mt-2 line-clamp-2 flex-1 text-sm leading-relaxed text-muted">
            {summary}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-muted">
            <span className="flex items-center gap-1.5">
              <CalendarDays className="size-3.5 shrink-0 text-clay" aria-hidden="true" />
              {formatDateTime(startAt)}
            </span>
            {location && (
              <span className="flex min-w-0 items-center gap-1.5">
                <MapPin className="size-3.5 shrink-0 text-clay" aria-hidden="true" />
                <span className="truncate">{location}</span>
              </span>
            )}
          </div>
        </div>
      </div>
    </CardShell>
  );
}
