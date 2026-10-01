import { describe, expect, it } from "vitest";
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { RESERVED_PAGE_SLUGS, isReservedPageSlug } from "@/lib/reserved-slugs";
import { slugify, uniqueSlug } from "@/lib/slug";

/**
 * Guards the reserved-slug list against the thing that makes hardcoded lists rot.
 *
 * `RESERVED_PAGE_SLUGS` is a plain `Set` of top-level route segments, written by
 * hand. The failure is always the same and always silent: someone adds
 * `src/app/(site)/careers/page.tsx`, nobody adds `careers`, and a CMS page titled
 * "Careers" is now reachable at two URLs with the same content — with a static
 * route winning and no canonical linking them. No test fails. Search engines just
 * quietly treat one as a duplicate of the other.
 *
 * So this reads the actual route tree and fails when a segment is missing from the
 * list. That turns the list from something to remember into something the suite
 * checks.
 */

/** Route groups like `(site)` do not create a URL segment. */
const GROUP = /^\(.+\)$/;

/** Dynamic segments. `/p/[slug]` is the CMS's own route, so it is not a shadow. */
const DYNAMIC = /^\[/;

const APP_DIR = join(process.cwd(), "src", "app");

/**
 * Every *static* top-level URL segment the app serves, from any route group.
 *
 * Only top-level directories are considered, descending through route groups on
 * the way, and dynamic segments are skipped — those are the CMS's own routes
 * rather than hand-written ones.
 *
 * Metadata routes are deliberately absent: `robots.ts` and `sitemap.ts` live at
 * the app root and produce `/robots.txt` and `/sitemap.xml` with no directory of
 * that name. They are covered separately, because `slugify` strips the dot, so
 * neither is reachable as a slug and reserving them would be noise.
 */
function staticTopLevelSegments(): Set<string> {
  const found = new Set<string>();

  const scan = (dir: string): void => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      // A route group is transparent, so its children sit at this same level.
      if (GROUP.test(entry.name)) {
        scan(join(dir, entry.name));
        continue;
      }
      if (!DYNAMIC.test(entry.name)) found.add(entry.name);
    }
  };

  scan(APP_DIR);
  return found;
}

describe("RESERVED_PAGE_SLUGS", () => {
  it("reserves every static top-level route the app actually serves", () => {
    const served = staticTopLevelSegments();
    const missing = [...served].filter((s) => !RESERVED_PAGE_SLUGS.has(s)).sort();

    expect(
      missing,
      missing.length
        ? `these routes are not in RESERVED_PAGE_SLUGS: ${missing.join(", ")}.\n` +
            "A CMS page with one of these slugs would shadow the route. Add it to " +
            "src/lib/reserved-slugs.ts."
        : ""
    ).toEqual([]);
  });

  it("reserves nothing that does not correspond to a route", () => {
    // The other direction. A stale entry is harmless at runtime, but it means the
    // list has drifted and is no longer evidence of anything — which is why the
    // forward check above cannot be trusted on its own.
    const served = staticTopLevelSegments();
    const stale = [...RESERVED_PAGE_SLUGS].filter((s) => !served.has(s)).sort();

    expect(
      stale,
      stale.length
        ? `RESERVED_PAGE_SLUGS lists segments with no matching route: ${stale.join(", ")}`
        : ""
    ).toEqual([]);
  });

  it("does not need to reserve the metadata routes, because slugify cannot produce them", () => {
    // The one legitimate exception to the two checks above, asserted explicitly so
    // a future reader does not "fix" it by adding them to the list.
    for (const route of ["robots.txt", "sitemap.xml"]) {
      expect(slugify(route)).not.toBe(route);
      expect(slugify(route)).not.toContain(".");
    }
  });

  it("covers the slugs an editor is most likely to collide with", () => {
    // A page titled "About" or "Contact" is the obvious thing to create, and the
    // most likely way to end up with two URLs for one page.
    for (const slug of ["about", "contact", "news", "products", "programs", "gallery"]) {
      expect(isReservedPageSlug(slug), `${slug} must be reserved`).toBe(true);
    }
  });

  it("does not reserve slugs the site does not serve", () => {
    // A CMS page called "Careers" is fine: there is no /careers route to shadow,
    // and /p/careers is a perfectly good URL for it.
    expect(isReservedPageSlug("careers")).toBe(false);
    expect(isReservedPageSlug("cooperative-committee")).toBe(false);
  });
});

describe("uniqueSlug with reserved slugs", () => {
  /** Stands in for a Prisma delegate: no rows, so only `reserved` can collide. */
  const emptyModel = {
    findFirst: async () => null,
  };

  /** Stands in for a table that already holds the given slugs. */
  const modelWith = (taken: string[]) => ({
    findFirst: async ({ where }: { where: { slug: string } }) =>
      taken.includes(where.slug) ? { slug: where.slug } : null,
  });

  it("suffixes a reserved slug instead of returning it", async () => {
    await expect(
      uniqueSlug(emptyModel, "About", undefined, RESERVED_PAGE_SLUGS)
    ).resolves.toBe("about-2");
  });

  it("keeps suffixing past consecutive reserved slugs", async () => {
    await expect(
      uniqueSlug(
        modelWith(["about-2", "about-3"]),
        "About",
        undefined,
        RESERVED_PAGE_SLUGS
      )
    ).resolves.toBe("about-4");
  });

  it("leaves an unreserved slug alone", async () => {
    await expect(
      uniqueSlug(emptyModel, "Annual Report", undefined, RESERVED_PAGE_SLUGS)
    ).resolves.toBe("annual-report");
  });

  it("behaves exactly as before when no reserved set is passed", async () => {
    // Every other slug model calls this without one; the change must not alter
    // its behaviour.
    await expect(uniqueSlug(emptyModel, "About")).resolves.toBe("about");
  });

  it("does not treat a reserved slug as a database collision", async () => {
    // The reserved check runs before the query, so a reserved candidate must not
    // even reach the model. A test that only checked the returned value would
    // pass even if the ordering regressed into a wasted round trip.
    let queries = 0;
    const counting = {
      findFirst: async () => {
        queries++;
        return null;
      },
    };

    await uniqueSlug(counting, "about", undefined, RESERVED_PAGE_SLUGS);

    // One query only: for `about-2`, not for the skipped `about`.
    expect(queries).toBe(1);
  });
});