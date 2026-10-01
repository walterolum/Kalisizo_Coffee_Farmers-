import { describe, expect, it } from "vitest";

import { buildUrlMap, planUrlRewrite, type UrlRewritePlan } from "@/lib/storage/rewrite";

/**
 * Guards the decision logic for repointing stored image URLs.
 *
 * This is the part of the storage migration that can quietly damage content. The
 * files moving is obvious; rewriting 23 columns of persisted URLs is where a
 * mistake becomes a broken website, and a mistake there is not visible in a diff
 * — it is visible in production, on every page that had an image.
 *
 * The failure modes worth defending against, in order of how badly they would
 * hurt:
 *
 *   1. Rewriting a `public/` path. `/pictures/coffee-farms.jpg` and
 *      `/images/logo.png` are served by the application itself and are the real
 *      content of the gallery and the logo. A broader match would repoint them at
 *      a bucket that does not contain them, and that is data loss, not a broken
 *      link.
 *   2. Rewriting an already-absolute URL, so a second run of the migration
 *      corrupts what the first run correctly wrote.
 *   3. Rewriting a reference to a file that was not uploaded, which breaks an
 *      image that still works today.
 *
 * Every case below is one of those.
 */

const NAME = "1700000000000-deadbeef.jpg";
const OTHER = "1790797985951-bd5c149f.png";

const map = buildUrlMap([
  { name: NAME, url: "https://project.supabase.co/storage/v1/object/public/cms-media/1700000000000-deadbeef.jpg" },
]);

/**
 * Asserts a rewrite is planned and returns it, narrowing the union.
 *
 * `expect(...).toBe()` does not narrow a discriminated union, so the tests below
 * would otherwise need a cast to read `.to` — and a cast would defeat the point
 * of the assertion, which is that the plan really is a rewrite.
 */
function expectRewrite(plan: UrlRewritePlan): Extract<UrlRewritePlan, { action: "rewrite" }> {
  if (plan.action !== "rewrite") {
    throw new Error(`expected a rewrite, got ${plan.action}`);
  }
  return plan;
}

describe("planUrlRewrite", () => {
  it("rewrites a local upload URL to the new location", () => {
    const plan = planUrlRewrite(`/uploads/${NAME}`, map);

    expect(plan).toEqual({
      action: "rewrite",
      from: `/uploads/${NAME}`,
      to: map.get(NAME),
      name: NAME,
    });
  });

  it("leaves every path served from public/ alone", () => {
    // These are real content, not uploads. The gallery is 14 hardcoded
    // `/pictures/...` files and the logo is `/images/logo-fixed.png`.
    for (const value of [
      "/pictures/coffee-farms.jpg",
      "/pictures/nursery-beds.jpg",
      "/images/logo.png",
      "/images/logo-light.png",
      "/images/farmers.jpg",
      "/leadership/muwonge-deo.jpeg",
    ]) {
      expect(planUrlRewrite(value, map)).toEqual({ action: "keep" });
    }
  });

  it("leaves an already-migrated absolute URL alone", () => {
    // Idempotence. Without this, running the migration twice would repoint an
    // absolute URL through the mapping again and corrupt it.
    const already = "https://project.supabase.co/storage/v1/object/public/cms-media/x.jpg";
    expect(planUrlRewrite(already, map)).toEqual({ action: "keep" });

    const cloudinary = "https://res.cloudinary.com/demo/image/upload/v1/abc.jpg";
    expect(planUrlRewrite(cloudinary, map)).toEqual({ action: "keep" });
  });

  it("keeps a reference whose file has not been uploaded yet", () => {
    // The file is still on local disk and still resolves. Repointing it now would
    // break an image that works today.
    const plan = planUrlRewrite(`/uploads/${OTHER}`, map);
    expect(plan).toEqual({ action: "keep" });
  });

  it("flags a value under /uploads/ that is not a well-formed stored name", () => {
    // Needs a human. Rewriting would be guessing at what the file is; skipping
    // it silently would leave a broken image nobody notices.
    for (const value of [
      "/uploads/../../etc/passwd",
      "/uploads/hand-written-name.jpg",
      "/uploads/nested/deeper.jpg",
      "/uploads/1700000000000-deadbeef.svg",
    ]) {
      const plan = planUrlRewrite(value, map);
      expect(plan.action, `expected ${value} to be flagged`).toBe("suspicious");
    }
  });

  it("does not rewrite a value that merely contains an upload path", () => {
    // Anchored matching. A substring rule would catch these.
    for (const value of [
      `https://example.com/uploads/${NAME}`,
      `https://cdn.example.com/uploads/${NAME}`,
      `/redirect?to=/uploads/${NAME}`,
    ]) {
      expect(planUrlRewrite(value, map).action, `expected ${value} to be kept`).toBe(
        "keep"
      );
    }
  });

  it("preserves a cache-buster or fragment when rewriting", () => {
    // Editors do paste these. Dropping the suffix would silently change how the
    // image is cached, which is the kind of change nobody notices until it bites.
    expect(expectRewrite(planUrlRewrite(`/uploads/${NAME}?v=2`, map)).to).toBe(
      `${map.get(NAME)}?v=2`
    );
    expect(expectRewrite(planUrlRewrite(`/uploads/${NAME}#top`, map)).to).toBe(
      `${map.get(NAME)}#top`
    );

    // No suffix stays clean.
    expect(expectRewrite(planUrlRewrite(`/uploads/${NAME}`, map)).to).toBe(map.get(NAME));
  });

  it("treats empty and null values as nothing to do", () => {
    expect(planUrlRewrite(null, map)).toEqual({ action: "keep" });
    expect(planUrlRewrite(undefined, map)).toEqual({ action: "keep" });
    expect(planUrlRewrite("", map)).toEqual({ action: "keep" });
  });

  it("keeps values that are not URLs at all", () => {
    // A malformed row must not be touched by a migration.
    for (const value of ["not a url", "www.example.com", "mailto:a@b.co"]) {
      expect(planUrlRewrite(value, map)).toEqual({ action: "keep" });
    }
  });
});

describe("buildUrlMap", () => {
  it("maps stored names to the URL the backend actually returned", () => {
    // The backends genuinely return different shapes: Supabase derives a path
    // from the project URL and bucket, Cloudinary returns its own public_id and
    // secure_url. Reconstructing the URL here instead of using what came back
    // would reintroduce the assumption the adapter removes.
    const built = buildUrlMap([
      { name: "a.jpg", url: "/uploads/a.jpg" },
      { name: "b.png", url: "https://x.co/b.png" },
    ]);

    expect(built.get("a.jpg")).toBe("/uploads/a.jpg");
    expect(built.get("b.png")).toBe("https://x.co/b.png");
    expect(built.size).toBe(2);
  });

  it("is empty when nothing was uploaded", () => {
    expect(buildUrlMap([]).size).toBe(0);
  });
});

describe("rewrite scope", () => {
  it("discovers URL columns from the schema rather than a hard-coded list", async () => {
    const { URL_COLUMN_SQL } = await import("@/lib/storage/rewrite");

    // A hard-coded list of 23 columns would silently miss a model added later,
    // and the only symptom would be an image that broke at cutover.
    //
    // This half is a pure assertion and needs no database, so it always runs.
    expect(URL_COLUMN_SQL).toMatch(/information_schema\.columns/);
    expect(URL_COLUMN_SQL).toMatch(/table_schema\s*=\s*'public'/);
  });

  it(
    "matches the columns the real schema actually has",
    // Generous, because the first probe pays for a cold connection and the rest
    // of the suite competes for Postgres backends. The default 5s was tight
    // enough to fail intermittently on a loaded machine, which made this file
    // look flaky for a reason that had nothing to do with the code under test.
    { timeout: 30_000 },
    async (ctx) => {
      const { URL_COLUMN_SQL } = await import("@/lib/storage/rewrite");
      const { databaseAvailable, disconnectQuietly } = await import(
        "./support/database"
      );

      if (!(await databaseAvailable())) {
        // Skipped rather than failed: "correct" for this assertion is defined
        // against the live schema, so with no database there is nothing to be
        // correct against. Reported as a skip so it is visible rather than
        // silently missing from a green run.
        return ctx.skip();
      }

      const { prisma } = await import("@/lib/prisma");
      try {
        const columns = await prisma.$queryRawUnsafe<
          Array<{ table_name: string; column_name: string }>
        >(URL_COLUMN_SQL);

        // The columns that actually hold this project's images today.
        const found = columns.map((c) => `${c.table_name}.${c.column_name}`);
        expect(found).toContain("Product.imageUrl");
        expect(found).toContain("CooperativeInfo.logoUrl");
        expect(found).toContain("LeadershipMember.photoUrl");
        expect(found).toContain("HeroContent.backgroundImage");
        expect(found).toContain("GalleryImage.url");

        // Nothing text-shaped that is obviously not a URL should have been swept in.
        for (const entry of found) {
          const column = entry.split(".")[1].toLowerCase();
          expect(column).toMatch(/image|url|logo|photo/);
        }
      } finally {
        await disconnectQuietly();
      }
    }
  );
});
