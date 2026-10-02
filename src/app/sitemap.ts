import type { MetadataRoute } from "next";
import { prisma } from "@/backend/prisma";
import { SITE_URL } from "@/shared/site";

/**
 * Static routes plus every published record that has its own detail page.
 *
 * This runs at request/build time, so it is generated on the fly rather than
 * being a static file. Each query is wrapped so one empty or failing table
 * cannot remove the whole sitemap.
 */
/**
 * The sitemap is rebuilt on every request rather than baked at build time.
 *
 * Prisma calls are invisible to Next's static analysis, so without this the
 * route is prerendered once and newly published articles stay out of the
 * sitemap until the next deployment.
 */
export const dynamic = "force-dynamic";

async function collect() {
  const [news, projects, events, programs, pages] = await Promise.all([
    prisma.newsArticle
      .findMany({
        where: { status: "PUBLISHED", deletedAt: null },
        select: { slug: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 500,
      })
      .catch((error) => {
        // Per-query isolation is deliberate: one unreachable table must not empty
        // the whole sitemap. But silence is not. An empty sitemap is
        // indistinguishable from a site with no content, so a database outage
        // would quietly de-index the site with nothing at all in the logs.
        console.warn("[sitemap] could not read newsArticle, omitting its URLs:", error);
        return [] as { slug: string; updatedAt: Date }[];
      }),
    prisma.project
      .findMany({
        where: { status: "PUBLISHED", deletedAt: null },
        select: { slug: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 500,
      })
      .catch((error) => {
        // Per-query isolation is deliberate: one unreachable table must not empty
        // the whole sitemap. But silence is not. An empty sitemap is
        // indistinguishable from a site with no content, so a database outage
        // would quietly de-index the site with nothing at all in the logs.
        console.warn("[sitemap] could not read project, omitting its URLs:", error);
        return [] as { slug: string; updatedAt: Date }[];
      }),
    prisma.event
      .findMany({
        where: { status: "PUBLISHED", deletedAt: null },
        select: { slug: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 500,
      })
      .catch((error) => {
        // Per-query isolation is deliberate: one unreachable table must not empty
        // the whole sitemap. But silence is not. An empty sitemap is
        // indistinguishable from a site with no content, so a database outage
        // would quietly de-index the site with nothing at all in the logs.
        console.warn("[sitemap] could not read event, omitting its URLs:", error);
        return [] as { slug: string; updatedAt: Date }[];
      }),
    prisma.service
      .findMany({
        where: { status: "PUBLISHED", deletedAt: null },
        select: { slug: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 200,
      })
      .catch((error) => {
        // Per-query isolation is deliberate: one unreachable table must not empty
        // the whole sitemap. But silence is not. An empty sitemap is
        // indistinguishable from a site with no content, so a database outage
        // would quietly de-index the site with nothing at all in the logs.
        console.warn("[sitemap] could not read service, omitting its URLs:", error);
        return [] as { slug: string; updatedAt: Date }[];
      }),
    // The about page has a dedicated route; the rest live under /p/<slug>.
    prisma.page
      .findMany({
        where: { status: "PUBLISHED", deletedAt: null },
        select: { slug: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 200,
      })
      .catch((error) => {
        // Per-query isolation is deliberate: one unreachable table must not empty
        // the whole sitemap. But silence is not. An empty sitemap is
        // indistinguishable from a site with no content, so a database outage
        // would quietly de-index the site with nothing at all in the logs.
        console.warn("[sitemap] could not read page, omitting its URLs:", error);
        return [] as { slug: string; updatedAt: Date }[];
      }),
  ]);

  return { news, projects, events, programs, pages };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = SITE_URL;
  // Without a canonical origin there is nothing valid to advertise. This is
  // worth a warning rather than a silent empty file: an empty sitemap looks
  // identical to a site with no content, so the misconfiguration would go
  // unnoticed until search engines had stopped crawling it.
  if (!base) {
    console.warn(
      "[sitemap] NEXT_PUBLIC_SITE_URL is not set, so /sitemap.xml is empty. Set it to the exact public origin."
    );
    return [];
  }

  /**
   * Static routes carry no `lastModified`.
   *
   * These pages are rendered from code, so their real modification time is the
   * deployment time — which this module has no honest way to know, since the
   * route is `force-dynamic` and evaluated per request. They previously claimed
   * `new Date()`, so every one of them advertised as modified at the instant of
   * the crawl. `lastModified` exists so crawlers can tell what to re-fetch;
   * telling them all ten pages changed a second ago, on every request, trains
   * them to ignore the field and crawl constantly instead.
   *
   * Omitting it is the truthful answer, and it is optional in the protocol.
   * `changeFrequency` still expresses intent, and the CMS-driven routes below
   * keep their real `updatedAt`.
   */
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: base, changeFrequency: "daily", priority: 1 },
    { url: `${base}/about`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${base}/programs`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/products`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/projects`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/news`, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/events`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${base}/gallery`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${base}/publications`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/contact`, changeFrequency: "monthly", priority: 0.9 },
  ];

  const { news, projects, events, programs, pages } = await collect();

  return [
    ...staticRoutes,
    ...news.map((item) => ({
      url: `${base}/news/${item.slug}`,
      lastModified: item.updatedAt,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    ...projects.map((item) => ({
      url: `${base}/projects/${item.slug}`,
      lastModified: item.updatedAt,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
    ...events.map((item) => ({
      url: `${base}/events/${item.slug}`,
      lastModified: item.updatedAt,
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
    ...programs.map((item) => ({
      url: `${base}/programs/${item.slug}`,
      lastModified: item.updatedAt,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    ...pages
      .filter((item) => item.slug !== "about")
      .map((item) => ({
        url: `${base}/p/${item.slug}`,
        lastModified: item.updatedAt,
        changeFrequency: "monthly" as const,
        priority: 0.5,
      })),
  ];
}
