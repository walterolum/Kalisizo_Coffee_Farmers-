import type { Prisma, ContentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PUBLIC_WHERE, resolvePublishedAt } from "@/lib/workflow";
import { uniqueSlug } from "@/lib/slug";

/**
 * Data access for editorial content.
 *
 * Routes stay thin by delegating here. Two rules are enforced centrally so they
 * cannot be forgotten at a call site:
 *   1. Soft-deleted rows (`deletedAt` set) are invisible to every query.
 *   2. `publishedAt` is always derived from the status, never trusted from input.
 */

/** The shape every public list ordering uses. */
export type ContentOrderBy =
  | Prisma.NewsArticleOrderByWithRelationInput
  | Prisma.EventOrderByWithRelationInput
  | Prisma.ProjectOrderByWithRelationInput
  | Prisma.AnnouncementOrderByWithRelationInput
  | Prisma.PublicationOrderByWithRelationInput
  | Prisma.PageOrderByWithRelationInput;

export type ContentDelegate = {
  count: (args: { where: Prisma.JsonObject }) => Promise<number>;
  findMany: (args: {
    where: Prisma.JsonObject;
    orderBy: unknown;
    skip?: number;
    take?: number;
    include?: unknown;
    select?: unknown;
  }) => Promise<unknown[]>;
  findFirst: (args: { where: Prisma.JsonObject; select?: unknown }) => Promise<unknown>;
};

export function getDelegate(model: string): ContentDelegate {
  const delegate = (prisma as unknown as Record<string, unknown>)[model];
  if (!delegate) throw new Error(`Unknown content model: ${model}`);
  return delegate as ContentDelegate;
}

/**
 * Resolves the status to persist.
 * When a request does not specify one, content is created as DRAFT and existing
 * content keeps its current status — so an Editor saving a published article
 * cannot accidentally unpublish it, and cannot publish one either.
 */
export function resolveStatus(
  requested: ContentStatus | undefined,
  current: ContentStatus | null
): ContentStatus {
  return requested ?? current ?? "DRAFT";
}

export function publishedAtFor(
  status: ContentStatus,
  existing: Date | null
): Date | null {
  return resolvePublishedAt(status, existing);
}

// ---------------------------------------------------------------------------
// News articles
// ---------------------------------------------------------------------------

export async function listNews(args: {
  page: number;
  pageSize: number;
  categorySlug?: string;
  tag?: string;
  search?: string;
  featuredOnly?: boolean;
  /** Admin lists include drafts; the public site never does. */
  includeUnpublished?: boolean;
}): Promise<{
  where: Prisma.NewsArticleWhereInput;
  orderBy: Prisma.NewsArticleOrderByWithRelationInput[];
}> {
  const where: Prisma.NewsArticleWhereInput = { deletedAt: null };
  if (!args.includeUnpublished) Object.assign(where, PUBLIC_WHERE);
  if (args.categorySlug) where.category = { slug: args.categorySlug };
  if (args.tag) where.tags = { some: { slug: args.tag } };
  if (args.featuredOnly) where.isFeatured = true;
  if (args.search) {
    where.OR = [
      { title: { contains: args.search, mode: "insensitive" } },
      { excerpt: { contains: args.search, mode: "insensitive" } },
      { content: { contains: args.search, mode: "insensitive" } },
    ];
  }
  // `publishedAt` is nullable, and Postgres sorts NULLs first on a DESC order
  // unless told otherwise, which floated undated articles to the top.
  return {
    where,
    orderBy: [{ isFeatured: "desc" }, { publishedAt: { sort: "desc", nulls: "last" } }],
  };
}

export async function findNewsBySlug(slug: string, includeUnpublished = false) {
  return prisma.newsArticle.findFirst({
    where: {
      slug,
      deletedAt: null,
      ...(includeUnpublished ? {} : PUBLIC_WHERE),
    },
    include: { author: { select: { id: true, name: true } }, category: true, tags: true },
  });
}

/** Connects the supplied tag names to an article, creating any that are new. */
export async function syncArticleTags(articleId: string, names: string[]) {
  await prisma.newsArticle.update({
    where: { id: articleId },
    data: { tags: { set: [] } },
  });
  const unique = Array.from(new Set(names.map((n) => n.trim()).filter(Boolean)));
  for (const name of unique) {
    const slug = await uniqueSlug(prisma.tag, name);
    const tag = await prisma.tag.upsert({
      where: { slug },
      create: { name, slug },
      update: {},
    });
    await prisma.newsArticle.update({
      where: { id: articleId },
      data: { tags: { connect: { id: tag.id } } },
    });
  }
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

/**
 * Separates an event list into upcoming and past so the UI can label them
 * without a second query.
 */
export function isUpcoming(startAt: Date, endAt: Date | null): boolean {
  const until = endAt ?? startAt;
  return until.getTime() >= Date.now();
}

export async function listEvents(args: {
  page: number;
  pageSize: number;
  upcomingOnly?: boolean;
  includeUnpublished?: boolean;
}): Promise<{
  where: Prisma.EventWhereInput;
  orderBy: Prisma.EventOrderByWithRelationInput[];
}> {
  const where: Prisma.EventWhereInput = { deletedAt: null };
  if (!args.includeUnpublished) Object.assign(where, PUBLIC_WHERE);
  if (args.upcomingOnly) {
    // An event is upcoming while it has not finished. Most events have no
    // `endAt`, so a plain `endAt >= now` filter would silently drop them —
    // compare against `endAt` when set and fall back to `startAt`.
    const now = new Date();
    where.OR = [
      { endAt: { gte: now } },
      { endAt: null, startAt: { gte: now } },
    ];
  }
  return { where, orderBy: [{ startAt: "asc" }] };
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export async function listProjects(args: {
  page: number;
  pageSize: number;
  stage?: string;
  includeUnpublished?: boolean;
}): Promise<{
  where: Prisma.ProjectWhereInput;
  orderBy: Prisma.ProjectOrderByWithRelationInput[];
}> {
  const where: Prisma.ProjectWhereInput = { deletedAt: null };
  if (!args.includeUnpublished) Object.assign(where, PUBLIC_WHERE);
  if (args.stage) where.stage = args.stage as Prisma.ProjectWhereInput["stage"];
  // Nullable `startDate` — `nulls: "last"` keeps undated projects below dated
  // ones instead of above them, which is Postgres's default for DESC.
  return { where, orderBy: [{ startDate: { sort: "desc", nulls: "last" } }] };
}

// ---------------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------------

/**
 * Announcements are live only inside their window: a notice with a future
 * `startsAt` or an expired `endsAt` is not shown, even once published.
 */
export async function listActiveAnnouncements(now = new Date()) {
  return prisma.announcement.findMany({
    where: {
      ...PUBLIC_WHERE,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
      ],
    },
    orderBy: [{ isPinned: "desc" }, { startsAt: "desc" }],
    take: 10,
  });
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export type SearchHit = {
  type: "news" | "project" | "event" | "publication";
  title: string;
  slug: string;
  summary: string;
  href: string;
  date: string | null;
  imageUrl: string | null;
};

/**
 * Searches across the main public content types.
 * Each model is queried separately so a slow or failing table cannot break the
 * whole search, and results are capped to keep the response small.
 */
export async function searchAll(term: string, limit = 5): Promise<SearchHit[]> {
  const q = term.trim();
  if (q.length < 2) return [];
  const hits: SearchHit[] = [];

  try {
    const news = await prisma.newsArticle.findMany({
      where: {
        ...PUBLIC_WHERE,
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { excerpt: { contains: q, mode: "insensitive" } },
        ],
      },
      select: {
        title: true, slug: true, excerpt: true,
        publishedAt: true, featuredImageUrl: true,
      },
      orderBy: { publishedAt: { sort: "desc", nulls: "last" } },
      take: limit,
    });
    hits.push(
      ...news.map((n) => ({
        type: "news" as const,
        title: n.title,
        slug: n.slug,
        summary: n.excerpt,
        href: `/news/${n.slug}`,
        date: n.publishedAt?.toISOString() ?? null,
        imageUrl: n.featuredImageUrl,
      }))
    );
  } catch (error) {
    console.error("[search] news failed:", error);
  }

  try {
    const projects = await prisma.project.findMany({
      where: {
        ...PUBLIC_WHERE,
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { summary: { contains: q, mode: "insensitive" } },
          { location: { contains: q, mode: "insensitive" } },
        ],
      },
      select: {
        title: true, slug: true, summary: true,
        startDate: true, imageUrl: true,
      },
      orderBy: { startDate: { sort: "desc", nulls: "last" } },
      take: limit,
    });
    hits.push(
      ...projects.map((p) => ({
        type: "project" as const,
        title: p.title,
        slug: p.slug,
        summary: p.summary,
        href: `/projects/${p.slug}`,
        date: p.startDate?.toISOString() ?? null,
        imageUrl: p.imageUrl,
      }))
    );
  } catch (error) {
    console.error("[search] projects failed:", error);
  }

  try {
    const events = await prisma.event.findMany({
      where: {
        ...PUBLIC_WHERE,
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { summary: { contains: q, mode: "insensitive" } },
          { location: { contains: q, mode: "insensitive" } },
        ],
      },
      select: {
        title: true, slug: true, summary: true,
        startAt: true, imageUrl: true,
      },
      orderBy: { startAt: "desc" },
      take: limit,
    });
    hits.push(
      ...events.map((e) => ({
        type: "event" as const,
        title: e.title,
        slug: e.slug,
        summary: e.summary,
        href: `/events/${e.slug}`,
        date: e.startAt.toISOString(),
        imageUrl: e.imageUrl,
      }))
    );
  } catch (error) {
    console.error("[search] events failed:", error);
  }

  try {
    const publications = await prisma.publication.findMany({
      where: {
        ...PUBLIC_WHERE,
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { summary: { contains: q, mode: "insensitive" } },
        ],
      },
      select: { title: true, slug: true, summary: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    hits.push(
      ...publications.map((p) => ({
        type: "publication" as const,
        title: p.title,
        slug: p.slug,
        summary: p.summary ?? "Downloadable document",
        href: `/publications`,
        date: p.createdAt.toISOString(),
        imageUrl: null,
      }))
    );
  } catch (error) {
    console.error("[search] publications failed:", error);
  }

  return hits;
}
