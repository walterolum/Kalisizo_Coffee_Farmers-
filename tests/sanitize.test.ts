import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { isRichTextField, richTextFieldMap, sanitizeRichText } from "@/shared/sanitize";

/**
 * Guards for the stored-XSS fix.
 *
 * Public pages inject CMS body copy with `dangerouslySetInnerHTML`. Before this
 * suite existed, the CMS stored whatever an editor typed and the public page
 * executed it — so the lowest-privilege `EDITOR` role could publish a payload
 * that ran for every anonymous visitor. `sanitizeRichText` closes that, and these
 * tests make sure it stays closed.
 *
 * The second block is the important one: it reads the real route sources and
 * fails if a `dangerouslySetInnerHTML` appears whose value is not in the
 * sanitiser's model/field map. That is what stops the next rich-text field from
 * being added without being sanitised, which is the only way this class of bug
 * comes back.
 */

describe("sanitizeRichText", () => {
  it("removes script elements and their contents", () => {
    const dirty = '<p>Hello</p><script>alert("xss")</script><p>Bye</p>';
    const clean = sanitizeRichText(dirty);

    expect(clean).not.toContain("script");
    expect(clean).not.toContain("alert");
    expect(clean).toContain("Hello");
    expect(clean).toContain("Bye");
  });

  it("removes event-handler attributes", () => {
    for (const payload of [
      '<img src="x" onerror="alert(1)">',
      '<p onclick="alert(1)">text</p>',
      '<div onmouseover="alert(1)">hover</div>',
      '<body onload="alert(1)">',
    ]) {
      const clean = sanitizeRichText(payload);
      expect(clean.toLowerCase()).not.toContain("onerror");
      expect(clean.toLowerCase()).not.toContain("onclick");
      expect(clean.toLowerCase()).not.toContain("onmouseover");
      expect(clean.toLowerCase()).not.toContain("onload");
    }
  });

  it("removes javascript: and data: URLs", () => {
    expect(sanitizeRichText('<a href="javascript:alert(1)">x</a>')).not.toContain("javascript");
    expect(sanitizeRichText('<a href="JaVaScRiPt:alert(1)">x</a>')).not.toContain("alert");
    expect(sanitizeRichText('<img src="data:text/html,<script>alert(1)</script>">')).not.toContain(
      "data:text/html"
    );
  });

  it("removes iframes, objects and embeds entirely", () => {
    for (const payload of [
      '<iframe src="https://evil.test"></iframe>',
      '<object data="evil.swf"></object>',
      '<embed src="evil.swf">',
      '<form action="https://evil.test"><input name="pw"></form>',
    ]) {
      const clean = sanitizeRichText(payload).toLowerCase();
      expect(clean).not.toContain("<iframe");
      expect(clean).not.toContain("<object");
      expect(clean).not.toContain("<embed");
      expect(clean).not.toContain("<form");
      expect(clean).not.toContain("<input");
    }
  });

  it("removes svg and math payloads that can carry script", () => {
    const clean = sanitizeRichText('<svg><script>alert(1)</script></svg>').toLowerCase();
    expect(clean).not.toContain("<svg");
    expect(clean).not.toContain("alert");
  });

  it("drops inline style, which is the standard clickjacking vector", () => {
    const clean = sanitizeRichText('<p style="position:fixed;inset:0">overlay</p>');
    expect(clean.toLowerCase()).not.toContain("position:fixed");
    expect(clean.toLowerCase()).not.toContain("style=");
  });

  it("adds rel=noopener to target=_blank links", () => {
    const clean = sanitizeRichText('<a href="https://example.test" target="_blank">out</a>');
    expect(clean).toContain('rel="noopener noreferrer"');
  });

  it("keeps an editor's own rel tokens", () => {
    const clean = sanitizeRichText('<a href="https://example.test" rel="nofollow" target="_blank">out</a>');
    expect(clean).toContain("nofollow");
    expect(clean).toContain("noopener");
  });

  it("preserves legitimate rich-text formatting", () => {
    const rich =
      '<h2>Heading</h2><p><strong>Bold</strong> and <em>italic</em> and <a href="https://kalisizo.co.ug">a link</a>.</p>' +
      '<ul><li>One</li><li>Two</li></ul><blockquote>Quoted</blockquote><img src="https://res.cloudinary.com/x.jpg" alt="Members">';

    const clean = sanitizeRichText(rich);

    for (const tag of ["<h2>", "<strong>", "<em>", "<ul>", "<li>", "<blockquote>", "<img"]) {
      expect(clean).toContain(tag);
    }
    expect(clean).toContain('href="https://kalisizo.co.ug"');
    expect(clean).toContain('alt="Members"');
  });

  it("preserves relative image paths used by local uploads", () => {
    expect(sanitizeRichText('<img src="/uploads/1700000000-abcd1234.jpg" alt="x">')).toContain(
      'src="/uploads/1700000000-abcd1234.jpg"'
    );
  });

  it("is idempotent, so re-saving an article cannot change it", () => {
    const rich = '<h2>Title</h2><p>Body with <a href="https://a.test" target="_blank">a link</a>.</p>';
    const once = sanitizeRichText(rich);
    expect(sanitizeRichText(once)).toBe(once);
  });

  it("returns plain text unchanged apart from escaping", () => {
    expect(sanitizeRichText("Just a sentence.")).toBe("Just a sentence.");
  });

  it("handles empty and whitespace input without throwing", () => {
    expect(sanitizeRichText("")).toBe("");
    expect(sanitizeRichText("   ")).toBe("   ");
  });

  it("survives malformed markup without throwing", () => {
    for (const malformed of [
      "<p>unclosed",
      "<<script>script>alert(1)<</script>/script>",
      '<img src="x" onerror="alert(1)"',
      "<div><span><p>nested</div></span></p>",
      "<!-- comment --><p>after</p>",
    ]) {
      expect(() => sanitizeRichText(malformed)).not.toThrow();
    }
  });
});

describe("rich-text field map", () => {
  it("covers every model that renders CMS copy as HTML", () => {
    const map = richTextFieldMap();
    expect(map).toMatchObject({
      newsArticle: ["content"],
      event: ["description"],
      project: ["description"],
      page: ["content"],
      service: ["content"],
    });
  });

  it("does not claim plain-text descriptions, which would double-escape them", () => {
    // `Product`, `SuccessStory`, `LeadershipMember` and `SocialLink` render
    // `description` as a React text node, where it is already safe. Escaping
    // would show "Tips &amp; Tricks" to the visitor.
    for (const model of ["product", "successStory", "leadershipMember", "socialLink"]) {
      expect(isRichTextField(model, "description")).toBe(false);
    }
  });

  it("ignores unknown models and fields", () => {
    expect(isRichTextField("nope", "content")).toBe(false);
    expect(isRichTextField("newsArticle", "title")).toBe(false);
  });
});

/**
 * The drift guard.
 *
 * Walks the public route tree, finds every `dangerouslySetInnerHTML` whose value
 * is a plain data binding (the JSON-LD block in `Location.tsx` is a literal and is
 * skipped), and asserts the source is sanitised. A new `dangerouslySetInnerHTML`
 * over unsanitised CMS content fails here rather than in production.
 */
describe("every dangerouslySetInnerHTML binding is sanitised", () => {
  const ROOTS = ["src/app/(site)", "src/frontend/components"];

  function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) return walk(full);
      return full.endsWith(".tsx") ? [full] : [];
    });
  }

  /** `dangerouslySetInnerHTML={{ __html: <expression> }}` */
  const BINDING = /dangerouslySetInnerHTML=\{\{\s*__html:\s*([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*\}\}/g;

  /**
   * Maps a property name in a route to the Prisma model that owns it.
   *
   * Routes name their row in the shape that reads best at the call site, which is
   * not always the model name: `/programs/[slug]` holds a `Service` but calls it
   * `program`, and `/news/[slug]` holds a `NewsArticle` but calls it `article`.
   */
  const MODEL_FOR_ROOT: Record<string, string> = {
    article: "newsArticle",
    program: "service",
    event: "event",
    project: "project",
    page: "page",
  };

  /**
   * Bindings that name a local variable rather than a property access. Each entry
   * records where the value really comes from, so the assertion below still holds
   * the file to account. A key that stops matching makes the test fail loudly
   * rather than skip the check.
   */
  const ALIASES: Record<string, string> = {
    // `const content = page?.content ?? fallback!.content;` in CmsContentPage.
    "CmsContentPage.tsx|content": "page.content",
  };

  const bindings = ROOTS.flatMap((root) => walk(root)).flatMap((file) => {
    const name = file.replace(/\\/g, "/").split("/").pop()!;
    const source = readFileSync(file, "utf8");
    return [...source.matchAll(BINDING)].map((m) => {
      const expression = m[1]!;
      return { file, name, expression, resolved: ALIASES[`${name}|${expression}`] ?? expression };
    });
  });

  it("finds the bindings this suite is guarding", () => {
    // Guards against the walk silently matching nothing after a refactor, which
    // would make every assertion below vacuously true.
    expect(bindings.length).toBeGreaterThan(0);
  });

  it("resolves every binding to a model and field", () => {
    // A binding that cannot be traced is reported here rather than quietly
    // counted as safe.
    for (const { name, expression, resolved } of bindings) {
      expect(
        resolved,
        `${name} binds the local "${expression}" as HTML but the test cannot trace it. ` +
          `Add it to ALIASES with the property it derives from.`
      ).toMatch(/^[a-zA-Z_$][\w$]*\.[a-zA-Z_$][\w$]*$/);
    }
  });

  it.each(bindings)("$file binds $expression from a sanitised field", ({ name, resolved }) => {
    const [root, field] = resolved.split(".");
    const model = MODEL_FOR_ROOT[root] ?? root;

    if (!isRichTextField(model, field)) {
      // A JSON-LD literal or a hard-coded string is not CMS content and needs no
      // sanitiser; anything reaching here from a live row is a hole.
      expect(
        name,
        `${resolved} is injected as HTML but "${model}.${field}" is not in the rich-text ` +
          `field map. Add it to RICH_TEXT_FIELDS in src/shared/sanitize.ts.`
      ).toBe("");
    }
  });
});
