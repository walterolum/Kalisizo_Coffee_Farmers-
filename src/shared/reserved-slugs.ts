/**
 * Slugs a CMS `Page` must not take.
 *
 * `/p/[slug]` is a catch-all for DB-backed pages, and the site also has
 * hand-written routes. Next.js gives the static route precedence, so a page
 * created with slug `about` would be served at `/about` — and the row itself
 * would only ever be reachable at `/p/about`, as a second URL for the same
 * content. Search engines treat that as duplicate content and split the signals
 * between two addresses, and neither one has a canonical pointing at the other.
 *
 * Nothing currently prevents that. `uniqueSlug` only checks for collisions within
 * the same table, and the `Page` table does not know the filesystem has routes.
 * So this is a latent trap rather than a live bug — it fires the moment someone
 * publishes a page titled "About".
 *
 * Reserved slugs are suffixed by `uniqueSlug` (`about` becomes `about-2`) rather
 * than rejected. Refusing the save would block a reasonable thing an editor is
 * trying to do, and silently redirecting them somewhere they did not ask for is
 * worse. A suffixed slug still says what the page is.
 *
 * The test in `tests/reserved-page-slugs.test.ts` reads the real route tree and
 * fails if a newly added page route is missing from this list, which is the only
 * way a hardcoded list like this stays honest.
 */

/**
 * Top-level segments owned by a hand-written route, file, or API.
 *
 * `admin`, `api` and the asset routes are included even though no CMS editor
 * would plausibly choose them: the cost of reserving them is a suffixed slug, and
 * the cost of not reserving them is a page silently shadowing the admin UI or the
 * API surface.
 */
export const RESERVED_PAGE_SLUGS: ReadonlySet<string> = new Set([
  // Pages in src/app/(site)/...
  "about",
  "contact",
  "events",
  "gallery",
  "news",
  "products",
  "programs",
  "projects",
  "publications",
  "search",

  // The CMS's own catch-all. Reserving it costs nothing — a page titled "P" is
  // not a thing anyone writes — and it keeps the list honest, since the drift
  // test reads the route tree and would otherwise report a gap.
  "p",

  // Owned by src/app/admin, src/app/api, or the upload route.
  "admin",
  "api",
  "uploads",
]);

/**
 * `/robots.txt` and `/sitemap.xml` are deliberately absent.
 *
 * They are served by `src/app/robots.ts` and `src/app/sitemap.ts` with no
 * directory of that name, and `slugify` strips the dot — `robots.txt` slugifies
 * to `robotstxt` — so neither can be produced by a page and neither needs
 * reserving. Listing them would be a dead entry that made the list look like it
 * knew more than it did.
 */

/** True when `slug` would collide with a hand-written route. */
export function isReservedPageSlug(slug: string): boolean {
  return RESERVED_PAGE_SLUGS.has(slug);
}