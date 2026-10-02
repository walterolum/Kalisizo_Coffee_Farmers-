import type { ProductCategory } from "@prisma/client";
import { prisma } from "@/backend/prisma";
import { PUBLIC_WHERE } from "@/shared/workflow";

/**
 * Server-side data access for the public pages.
 *
 * Every function here is used from React Server Components, so it must never
 * throw: if the database is unavailable the page should still render its
 * chrome with an empty state rather than showing a 500. Each helper therefore
 * logs and returns a safe empty value on failure.
 */

async function safely<T>(label: string, run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch (error) {
    console.error(`[site] ${label} failed:`, error);
    return fallback;
  }
}

export type NewsSummary = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  featuredImageUrl: string | null;
  imageAlt: string | null;
  publishedAt: Date | null;
  category: { name: string; slug: string } | null;
  author: { name: string } | null;
};

export async function getPublishedNews(take = 12): Promise<NewsSummary[]> {
  return safely(
    "getPublishedNews",
    async () =>
      prisma.newsArticle.findMany({
        where: PUBLIC_WHERE,
        // `publishedAt` is nullable. See `getPublishedProjects`: without
        // `nulls: "last"` Postgres sorts NULLs first on a DESC order.
        orderBy: [
          { isFeatured: "desc" },
          { publishedAt: { sort: "desc", nulls: "last" } },
        ],
        take,
        select: {
          id: true,
          title: true,
          slug: true,
          excerpt: true,
          featuredImageUrl: true,
          imageAlt: true,
          publishedAt: true,
          category: { select: { name: true, slug: true } },
          author: { select: { name: true } },
        },
      }),
    []
  );
}

export type NewsDetail = NewsSummary & {
  content: string;
  seoTitle: string | null;
  seoDescription: string | null;
  updatedAt: Date;
  tags: { name: string; slug: string }[];
};

export async function getNewsBySlug(slug: string): Promise<NewsDetail | null> {
  return safely("getNewsBySlug", () => prisma.newsArticle.findFirst({
    where: { slug, ...PUBLIC_WHERE },
    select: {
      id: true,
      title: true,
      slug: true,
      excerpt: true,
      content: true,
      featuredImageUrl: true,
      imageAlt: true,
      publishedAt: true,
      updatedAt: true,
      seoTitle: true,
      seoDescription: true,
      category: { select: { name: true, slug: true } },
      author: { select: { name: true } },
      tags: { select: { name: true, slug: true } },
    },
  }), null);
}

export type ProjectSummary = {
  id: string;
  title: string;
  slug: string;
  summary: string;
  location: string | null;
  stage: string;
  imageUrl: string | null;
  imageAlt: string | null;
  startDate: Date | null;
  partners: string[];
};

export async function getPublishedProjects(take = 24): Promise<ProjectSummary[]> {
  return safely(
    "getPublishedProjects",
    async () =>
      prisma.project.findMany({
        where: PUBLIC_WHERE,
        // `startDate` is nullable, and Postgres sorts NULLs FIRST on a DESC
        // order by default — which put every undated project above every dated
        // one. `nulls: "last"` is what actually expresses "most recent first".
        orderBy: [{ startDate: { sort: "desc", nulls: "last" } }],
        take,
        select: {
          id: true,
          title: true,
          slug: true,
          summary: true,
          location: true,
          stage: true,
          imageUrl: true,
          imageAlt: true,
          startDate: true,
          partners: true,
        },
      }),
    []
  );
}

export type ProjectDetail = ProjectSummary & {
  description: string | null;
  endDate: Date | null;
  impact: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  images: { id: string; url: string; thumbnailUrl: string | null; alt: string; caption: string | null }[];
};

export async function getProjectBySlug(slug: string): Promise<ProjectDetail | null> {
  return safely("getProjectBySlug", () => prisma.project.findFirst({
    where: { slug, ...PUBLIC_WHERE },
    select: {
      id: true,
      title: true,
      slug: true,
      summary: true,
      description: true,
      location: true,
      stage: true,
      imageUrl: true,
      imageAlt: true,
      startDate: true,
      endDate: true,
      partners: true,
      impact: true,
      seoTitle: true,
      seoDescription: true,
      images: {
        where: PUBLIC_WHERE,
        orderBy: { displayOrder: "asc" },
        select: { id: true, url: true, thumbnailUrl: true, alt: true, caption: true },
      },
    },
  }), null);
}

export type EventSummary = {
  id: string;
  title: string;
  slug: string;
  summary: string;
  startAt: Date;
  endAt: Date | null;
  location: string | null;
  imageUrl: string | null;
};

export async function getPublishedEvents(take = 24): Promise<EventSummary[]> {
  return safely(
    "getPublishedEvents",
    async () =>
      prisma.event.findMany({
        where: PUBLIC_WHERE,
        orderBy: [{ startAt: "asc" }],
        take,
        select: {
          id: true,
          title: true,
          slug: true,
          summary: true,
          startAt: true,
          endAt: true,
          location: true,
          imageUrl: true,
        },
      }),
    []
  );
}

export type EventDetail = EventSummary & {
  description: string | null;
  organizer: string | null;
  imageAlt: string | null;
  registrationInfo: string | null;
};

/**
 * Splits events into upcoming and past.
 *
 * The reference time is read here rather than in a page component: `Date.now()`
 * inside a component body is an impure render, and React rejects it because a
 * re-render could otherwise produce a different result. Server components render
 * once per request, so the value stays correct.
 */
export type EventTimings = { upcoming: EventSummary[]; past: EventSummary[] };

export async function getEventsByTiming(take = 100): Promise<EventTimings> {
  return safely(
    "getEventsByTiming",
    async () => {
      const events = await prisma.event.findMany({
        where: PUBLIC_WHERE,
        orderBy: [{ startAt: "asc" }],
        take,
        select: {
          id: true,
          title: true,
          slug: true,
          summary: true,
          startAt: true,
          endAt: true,
          location: true,
          imageUrl: true,
        },
      });
      const now = Date.now();
      return {
        upcoming: events.filter((event) => event.startAt.getTime() >= now),
        past: events
          .filter((event) => event.startAt.getTime() < now)
          .sort((a, b) => b.startAt.getTime() - a.startAt.getTime()),
      };
    },
    { upcoming: [], past: [] }
  );
}

/** True once an event's start time has passed. See `getEventsByTiming`. */
export function isPastEvent(startAt: Date): boolean {
  return startAt.getTime() < Date.now();
}

export async function getEventBySlug(slug: string): Promise<EventDetail | null> {
  return safely("getEventBySlug", () => prisma.event.findFirst({
    where: { slug, ...PUBLIC_WHERE },
    select: {
      id: true,
      title: true,
      slug: true,
      summary: true,
      description: true,
      startAt: true,
      endAt: true,
      location: true,
      organizer: true,
      imageUrl: true,
      imageAlt: true,
      registrationInfo: true,
    },
  }), null);
}

export type ProgramSummary = {
  id: string;
  title: string;
  slug: string;
  tagline: string;
  summary: string | null;
  points: string[];
  icon: string | null;
  displayOrder: number;
  imageUrl: string | null;
};

export async function getPublishedPrograms(): Promise<ProgramSummary[]> {
  return safely(
    "getPublishedPrograms",
    async () =>
      prisma.service.findMany({
        where: PUBLIC_WHERE,
        orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          title: true,
          slug: true,
          tagline: true,
          summary: true,
          points: true,
          icon: true,
          displayOrder: true,
          imageUrl: true,
        },
      }),
    []
  );
}

export type ProgramDetail = ProgramSummary & {
  content: string | null;
  details: string[];
  imageAlt: string | null;
  category: string | null;
};

export async function getProgramBySlug(slug: string): Promise<ProgramDetail | null> {
  return safely("getProgramBySlug", () => prisma.service.findFirst({
    where: { slug, ...PUBLIC_WHERE },
    select: {
      id: true,
      title: true,
      slug: true,
      tagline: true,
      summary: true,
      content: true,
      points: true,
      details: true,
      icon: true,
      imageUrl: true,
      imageAlt: true,
      category: true,
      displayOrder: true,
    },
  }), null);
}

export type PublicationSummary = {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  fileUrl: string;
  fileName: string;
  fileSizeBytes: number;
  mimeType: string;
  kind: string;
  publishedAt: Date | null;
};

export async function getPublishedPublications(take = 50): Promise<PublicationSummary[]> {
  return safely(
    "getPublishedPublications",
    async () =>
      prisma.publication.findMany({
        where: PUBLIC_WHERE,
        // `publishedAt` is nullable — see `getPublishedProjects` for why the
        // explicit `nulls: "last"` is required here.
        orderBy: [{ publishedAt: { sort: "desc", nulls: "last" } }],
        take,
        select: {
          id: true,
          title: true,
          slug: true,
          summary: true,
          fileUrl: true,
          fileName: true,
          fileSizeBytes: true,
          mimeType: true,
          kind: true,
          publishedAt: true,
        },
      }),
    []
  );
}

export type GalleryImageSummary = {
  id: string;
  url: string;
  thumbnailUrl: string | null;
  alt: string;
  caption: string | null;
  album: { title: string; slug: string } | null;
};

export async function getPublishedGalleryImages(take = 48): Promise<GalleryImageSummary[]> {
  return safely(
    "getPublishedGalleryImages",
    async () =>
      prisma.galleryImage.findMany({
        where: PUBLIC_WHERE,
        orderBy: [{ displayOrder: "asc" }, { createdAt: "desc" }],
        take,
        select: {
          id: true,
          url: true,
          thumbnailUrl: true,
          alt: true,
          caption: true,
          album: { select: { title: true, slug: true } },
        },
      }),
    []
  );
}

export type AnnouncementSummary = {
  id: string;
  title: string;
  body: string;
  severity: string;
  linkUrl: string | null;
  linkLabel: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
};

export async function getActiveAnnouncements(): Promise<AnnouncementSummary[]> {
  return safely(
    "getActiveAnnouncements",
    async () => {
      const now = new Date();
      return prisma.announcement.findMany({
        where: {
          ...PUBLIC_WHERE,
          AND: [
            { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
            { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
          ],
        },
        orderBy: [{ isPinned: "desc" }, { startsAt: "desc" }],
        take: 5,
        select: {
          id: true,
          title: true,
          body: true,
          severity: true,
          linkUrl: true,
          linkLabel: true,
          startsAt: true,
          endsAt: true,
        },
      });
    },
    []
  );
}

export type LeadershipSummary = {
  id: string;
  name: string;
  title: string;
  bio: string | null;
  photoUrl: string | null;
  icon: string | null;
};

export async function getLeadership(): Promise<LeadershipSummary[]> {
  return safely(
    "getLeadership",
    async () =>
      prisma.leadershipMember.findMany({
        where: { deletedAt: null },
        orderBy: { displayOrder: "asc" },
        select: {
          id: true,
          name: true,
          title: true,
          bio: true,
          photoUrl: true,
          icon: true,
        },
      }),
    []
  );
}

export type StoreLocationSummary = {
  id: string;
  name: string;
  address: string | null;
  district: string | null;
  subCounty: string | null;
  phone: string | null;
  email: string | null;
  latitude: number | null;
  longitude: number | null;
  isMainBranch: boolean;
};

export async function getLocations(): Promise<StoreLocationSummary[]> {
  return safely(
    "getLocations",
    async () =>
      prisma.storeLocation.findMany({
        where: { deletedAt: null },
        orderBy: [{ isMainBranch: "desc" }, { createdAt: "asc" }],
        select: {
          id: true,
          name: true,
          address: true,
          district: true,
          subCounty: true,
          phone: true,
          email: true,
          latitude: true,
          longitude: true,
          isMainBranch: true,
        },
      }),
    []
  );
}

export type ProductSummary = {
  id: string;
  title: string;
  description: string | null;
  price: string | null;
  unit: string | null;
  badge: string | null;
  cta: string | null;
  imageUrl: string | null;
  category: ProductCategory;
};

export async function getProducts(category?: ProductCategory): Promise<ProductSummary[]> {
  return safely(
    "getProducts",
    async () =>
      prisma.product.findMany({
        where: {
          isAvailable: true,
          deletedAt: null,
          ...(category ? { category } : {}),
        },
        orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          title: true,
          description: true,
          price: true,
          unit: true,
          badge: true,
          cta: true,
          imageUrl: true,
          category: true,
        },
      }),
    []
  );
}

export type FaqSummary = { id: string; question: string; answer: string };

export async function getFaqs(): Promise<FaqSummary[]> {
  return safely(
    "getFaqs",
    async () =>
      prisma.faqItem.findMany({
        where: { deletedAt: null },
        orderBy: [{ displayOrder: "asc" }],
        select: { id: true, question: true, answer: true },
      }),
    []
  );
}

/** A CMS-managed free-form page, e.g. `/about` or `/privacy`. */
export type PageDetail = {
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  imageUrl: string | null;
  imageAlt: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  updatedAt: Date;
};

export async function getPageBySlug(slug: string): Promise<PageDetail | null> {
  return safely("getPageBySlug", () => prisma.page.findFirst({
    where: { slug, ...PUBLIC_WHERE },
    select: {
      title: true,
      slug: true,
      excerpt: true,
      content: true,
      imageUrl: true,
      imageAlt: true,
      seoTitle: true,
      seoDescription: true,
      updatedAt: true,
    },
  }), null);
}
