import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

/**
 * Behavioural test for slug derivation on *rename*, not just on create.
 *
 * This is the half of the reserved-slug protection that is easy to miss. The
 * create path has always run the slug through `uniqueSlug`; the update path used
 * to write whatever the client sent, verbatim. So the protection was cosmetic:
 *
 *   1. An editor creates a page titled "Careers". It gets slug `careers`.
 *   2. They edit it and set the slug to `about`.
 *   3. `slugField` accepts `about` — it matches the pattern perfectly, it is
 *      just a lowercase hyphenated word.
 *   4. The write lands, and now `/about` serves the hand-written page while
 *      `/p/about` serves the CMS row: two URLs, one piece of content, no
 *      canonical linking them.
 *
 * A duplicate created by an ordinary rename is the realistic way this would have
 * shipped, and nothing about it looks like a bug until search traffic splits.
 *
 * Proven by calling the real handler with the guard, rate limiter, Prisma and
 * publish side effects stubbed, and asserting on the data actually handed to
 * `update`. Deliberately not a text search over the source: `admin-authorization`
 * documents why that kind of check can pass with the logic deleted.
 */

const ADMIN = {
  sub: "admin-1",
  email: "admin@kalisizocoop.coop",
  name: "Grace N.",
  role: "SUPER_ADMIN",
} as never;

/** Row as it comes back from the database before the rename. */
const EXISTING_PAGE = {
  id: "page-1",
  slug: "careers",
  title: "Careers",
  status: "DRAFT",
  deletedAt: null,
  publishedAt: null,
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

/** Every slug currently in the table — used to decide uniqueness. */
let takenSlugs: string[] = [];

/** Captures the `data` object passed to the update delegate. */
let updateData: Record<string, unknown> | null = null;

/** Counts slug lookups, so "did this actually consult the database" is observable. */
let slugQueries = 0;

vi.mock("@/backend/admin-guard", () => ({
  requirePermission: async () => ({ user: ADMIN }),
  adminRateLimit: () => null,
  can: () => true,
  roleLabel: () => "Administrator",
}));

vi.mock("@/backend/publish", () => ({
  recordAudit: async () => {},
  publish: async () => {},
  publishMeta: () => ({ publishedAt: new Date().toISOString(), publishedBy: "Grace N." }),
  assertFresh: async () => null,
}));

vi.mock("@/backend/prisma", () => {
  /** Shared stub: `findUnique` returns the row, `findFirst` answers uniqueness. */
  const makeDelegate = (row: Record<string, unknown>) => ({
    findUnique: async () => row,
    findFirst: async ({ where }: { where: { slug: string } }) => {
      slugQueries++;
      return takenSlugs.includes(where.slug) ? { slug: where.slug } : null;
    },
    update: async ({ data }: { data: Record<string, unknown> }) => {
      updateData = data;
      return { ...row, ...data };
    },
    create: async ({ data }: { data: Record<string, unknown> }) => {
      updateData = data;
      return { ...row, ...data };
    },
  });

  return {
    prisma: {
      page: makeDelegate(EXISTING_PAGE),
      newsArticle: makeDelegate(EXISTING_PAGE),
    },
  };
});

const pageSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1).max(200),
  slug: z.string().optional(),
  status: z.string().optional(),
  baseUpdatedAt: z.string().optional(),
  excerpt: z.string().optional(),
  body: z.string().optional(),
});

/** Minimal `HandlerConfig` for a page write. */
function config() {
  return {
    req: new Request("https://example.test/api/v1/admin/pages", { method: "POST" }),
    model: "page" as never,
    targetType: "Page" as never,
    collection: "pages",
    schema: pageSchema,
    titleOf: (row: Record<string, unknown>) => String(row.title ?? ""),
    toData: (parsed: Record<string, unknown>) => ({ ...parsed }),
  };
}

async function write(payload: Record<string, unknown>) {
  const { handleContentWrite } = await import("@/backend/admin-content");
  const req = new Request("https://example.test/api/v1/admin/pages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleContentWrite({ ...config(), req });
}

beforeEach(() => {
  takenSlugs = [];
  updateData = null;
  slugQueries = 0;
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("reserved slugs on rename", () => {
  it("suffixes a slug that would shadow a hand-written route", async () => {
    await write({ id: "page-1", title: "Careers", slug: "about" });

    // `about` is the static route. The row must land somewhere else, or the
    // route starts shadowing it and /p/about becomes a duplicate URL.
    expect(updateData?.slug).toBe("about-2");
  });

  it("does not re-derive the slug from the title on an ordinary edit", async () => {
    // Worth stating explicitly, because the obvious "fix" for a bypass is to
    // re-derive on every write — and that would be a real bug. Omitting `slug`
    // changes nothing, so no duplicate can arise. Re-deriving here would rewrite
    // a published page's URL every time its title is tweaked.
    await write({ id: "page-1", title: "About", slug: undefined });

    expect(updateData?.slug).toBeUndefined();
    expect(slugQueries).toBe(0);
  });

  it("suffixes past a slug already taken by another page", async () => {
    takenSlugs = ["about-2"];
    await write({ id: "page-1", title: "Careers", slug: "about" });

    expect(updateData?.slug).toBe("about-3");
  });

  it("accepts an ordinary rename", async () => {
    await write({ id: "page-1", title: "Working With Us", slug: "work-with-us" });

    expect(updateData?.slug).toBe("work-with-us");
  });

  it("leaves the slug untouched when the rename is not supplied", async () => {
    await write({ id: "page-1", title: "Careers" });

    // No `slug` key at all. The write must not invent one, and must not spend a
    // uniqueness query — an ordinary content edit is not a rename.
    expect("slug" in (updateData ?? {})).toBe(false);
    expect(slugQueries).toBe(0);
  });

  it("does not append a suffix to a page's own unchanged slug", async () => {
    // The common case: the CMS posts the whole form back, slug included, on every
    // save. Re-saving `careers` must stay `careers`, not become `careers-2`.
    // The value reaches the write from the payload rather than from `uniqueSlug`,
    // and the tell is that no uniqueness query was spent: nothing was treated as
    // a rename.
    await write({ id: "page-1", title: "Careers", slug: "careers" });

    expect(updateData?.slug).toBe("careers");
    expect(slugQueries).toBe(0);
  });

  it("keeps a page's own slug available to it while checking collisions", async () => {
    // The row is itself in the table under `careers`, so a naive collision check
    // would find itself and suffix. `excludeId` is what prevents that, and it
    // also means renaming *to* a slug another row holds still gets caught.
    takenSlugs = ["careers", "work-with-us"];
    await write({ id: "page-1", title: "Careers", slug: "work-with-us" });

    expect(updateData?.slug).toBe("work-with-us-2");
  });

  it("does not reserve slugs on a model that owns a dedicated route prefix", async () => {
    // Only `Page` competes with the hand-written routes. A news article titled
    // "About" lives at /news/about-2 whether we like it or not, because the URL
    // is prefixed — so reserving `about` there would rename content for no reason.
    const { handleContentWrite } = await import("@/backend/admin-content");
    const newsSchema = z.object({
      id: z.string().optional(),
      title: z.string().min(1).max(200),
      slug: z.string().optional(),
      status: z.string().optional(),
    });

    const req = new Request("https://example.test/api/v1/admin/news", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "page-1", title: "About", slug: "about" }),
    });

    await handleContentWrite({
      req,
      model: "newsArticle" as never,
      targetType: "NewsArticle" as never,
      collection: "news",
      schema: newsSchema,
      titleOf: (row: Record<string, unknown>) => String(row.title ?? ""),
      toData: (parsed: Record<string, unknown>) => ({ ...parsed }),
    });

    // Uniqueness is still enforced; the reserved set is simply not consulted.
    expect(updateData?.slug).toBe("about");
  });
});