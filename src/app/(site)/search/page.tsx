import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Search as SearchIcon, FileText, CalendarDays, FolderKanban, Newspaper } from "lucide-react";
import { EmptyState, PageHero } from "@/frontend/components/PageHero";
import { formatDate } from "@/frontend/components/ContentCards";
import { searchAll } from "@/backend/content";

export const metadata: Metadata = {
  title: "Search",
  description: "Search news, projects, events and publications from the Kalisizo Coffee Cooperative.",
  robots: { index: false, follow: true },
};

const TYPE_ICON = {
  news: Newspaper,
  project: FolderKanban,
  event: CalendarDays,
  publication: FileText,
} as const;

const TYPE_LABEL = {
  news: "News",
  project: "Project",
  event: "Event",
  publication: "Document",
} as const;

type PageProps = { searchParams: Promise<{ q?: string }> };

export default async function SearchPage({ searchParams }: PageProps) {
  const { q } = await searchParams;
  const query = (q ?? "").slice(0, 120);
  const trimmed = query.trim();
  // A one-character term would match most of the site, so require two.
  const results = trimmed.length >= 2 ? await searchAll(trimmed, 30) : [];

  return (
    <>
      <PageHero
        eyebrow="Search"
        title="Search the site"
        description="Look for news articles, projects, events and downloadable documents."
      />

      <section className="bg-cream py-16 sm:py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          {/* Plain GET form so search results are linkable and work without JS. */}
          <form action="/search" method="get" role="search" className="flex gap-3">
            <label htmlFor="q" className="sr-only">
              Search terms
            </label>
            <div className="relative flex-1">
              <SearchIcon
                className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted"
                aria-hidden="true"
              />
              <input
                id="q"
                name="q"
                type="search"
                defaultValue={query}
                placeholder="e.g. washing station"
                maxLength={120}
                className="w-full rounded-full border border-coffee/12 bg-white py-3.5 pl-12 pr-4 text-coffee outline-none transition-colors placeholder:text-muted focus:border-gold"
              />
            </div>
            <button type="submit" className="btn btn-primary shrink-0">
              Search
            </button>
          </form>

          <div className="mt-12">
            {trimmed.length === 0 ? (
              <EmptyState
                title="What are you looking for?"
                description="Enter at least two characters above to search across the cooperative's published content."
              />
            ) : trimmed.length === 1 ? (
              <EmptyState
                title="Keep typing"
                description="Search terms need to be at least two characters long."
              />
            ) : results.length === 0 ? (
              <EmptyState
                title={`No results for “${trimmed}”`}
                description="Try a different spelling or a broader term, or browse the newsroom and publications pages."
              >
                <div className="flex flex-wrap justify-center gap-3">
                  <Link href="/news" className="btn btn-outline">
                    Browse news
                  </Link>
                  <Link href="/publications" className="btn btn-outline">
                    Browse documents
                  </Link>
                </div>
              </EmptyState>
            ) : (
              <>
                <p className="text-sm text-muted" role="status">
                  {results.length} result{results.length === 1 ? "" : "s"} for{" "}
                  <span className="font-semibold text-forest">{trimmed}</span>
                </p>
                <ul className="mt-6 grid gap-4">
                  {results.map((hit) => {
                    const Icon = TYPE_ICON[hit.type];
                    return (
                      <li key={`${hit.type}-${hit.slug}`}>
                        <Link
                          href={hit.href}
                          className="group flex gap-4 bg-white p-5 ring-1 ring-coffee/8 transition-colors duration-300 hover:ring-gold/40"
                        >
                          {hit.imageUrl ? (
                            <span className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-leaf">
                              <Image
                                src={hit.imageUrl}
                                alt=""
                                fill
                                sizes="5rem"
                                className="object-cover"
                              />
                            </span>
                          ) : (
                            <span
                              className="flex size-20 shrink-0 items-center justify-center rounded-xl bg-forest text-gold-light"
                              aria-hidden="true"
                            >
                              <Icon className="size-7" />
                            </span>
                          )}
                          <div className="min-w-0 flex-1">
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-clay">
                              <Icon className="size-3.5" aria-hidden="true" />
                              {TYPE_LABEL[hit.type]}
                            </span>
                            <h2 className="mt-1.5 font-display text-base font-semibold leading-snug text-forest">
                              {hit.title}
                            </h2>
                            <p className="mt-1.5 line-clamp-2 text-sm text-muted">
                              {hit.summary}
                            </p>
                            {hit.date && (
                              <time
                                dateTime={hit.date}
                                className="mt-2 block text-[12px] text-muted"
                              >
                                {formatDate(hit.date)}
                              </time>
                            )}
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
