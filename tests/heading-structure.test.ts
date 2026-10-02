import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Heading-structure guards.
 *
 * Missing `h1` and skipped heading levels are silent failures: the page looks
 * correct, nothing throws, and no test notices. They only show up in an audit or
 * a screen-reader pass, long after the fact. These assertions cover the two that
 * were actually wrong rather than trying to prove the whole tree is perfect.
 *
 * `/contact` shipped with no `h1` anywhere: `Contact` renders its heading through
 * `SectionHeading`, which hardcoded `h2`, and the page has no hero to supply one.
 * Every other public route gets its `h1` from `PageHero`, either directly or via
 * `CmsContentPage`, so the fix was a level prop rather than new markup.
 */

const read = (path: string) => readFileSync(path, "utf8");

describe("public heading structure", () => {
  it("/contact promotes its main heading to h1", () => {
    const page = read("src/app/(site)/contact/page.tsx");
    // The component is shared with the home page, where Hero already supplies
    // the h1, so the level has to be passed per-usage rather than defaulted.
    expect(page).toMatch(/<Contact\s+headingLevel=\{1\}/);
  });

  it("the home page leaves Contact's heading as h2", () => {
    const home = read("src/app/(site)/page.tsx");
    // An h1 here would give the home page two of them: Hero plus Contact.
    expect(home).toMatch(/<Contact\s*\/>/);
    expect(home).not.toMatch(/<Contact\s+headingLevel/);
  });

  it("SectionHeading defaults to h2 and can be promoted", () => {
    const source = read("src/frontend/components/SectionHeading.tsx");

    // Default is h2, because the component is almost always a section inside a
    // page whose hero already has the h1.
    expect(source).toMatch(/as\?:\s*"h1"\s*\|\s*"h2"/);
    expect(source).toMatch(/as:\s*Heading\s*=\s*"h2"/);

    // The rendered tag must be the variable, not a literal <h2> left behind.
    expect(source).toMatch(/<Heading\b/);
    expect(source).not.toMatch(/<h2\b/);
  });
});