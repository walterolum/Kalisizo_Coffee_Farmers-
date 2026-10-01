import { describe, expect, it } from "vitest";
import { slugify, toPlainText, uniqueSlug } from "@/lib/slug";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Harvest Report 2024")).toBe("harvest-report-2024");
  });

  it("strips accents rather than transliterating them into dashes", () => {
    expect(slugify("Café Nyabirongo")).toBe("cafe-nyabirongo");
  });

  it("collapses punctuation runs and trims separators", () => {
    expect(slugify("  --- Annual   Report!!! --- ")).toBe("annual-report");
  });

  it("drops characters that are unsafe in a URL", () => {
    expect(slugify("A/B?C&D=E")).toBe("a-b-c-d-e");
  });

  it("never leaves a trailing dash after truncation", () => {
    const long = `${"word ".repeat(40)}tail`;
    const result = slugify(long);
    expect(result.length).toBeLessThanOrEqual(80);
    expect(result.endsWith("-")).toBe(false);
  });

  it("returns an empty string when there is nothing to slugify", () => {
    expect(slugify("!!!")).toBe("");
    expect(slugify("")).toBe("");
  });
});

describe("uniqueSlug", () => {
  /** In-memory stand-in for a Prisma delegate. */
  const modelWith = (taken: string[]) => ({
    findFirst: async ({ where }: { where: { slug: string; NOT?: { id: string } } }) => {
      if (where.NOT && taken.includes(where.slug)) return null; // record's own slug
      return taken.includes(where.slug) ? { slug: where.slug } : null;
    },
  });

  it("returns the base slug when it is free", async () => {
    await expect(uniqueSlug(modelWith([]), "Annual Report")).resolves.toBe("annual-report");
  });

  it("appends a counter when the slug is taken", async () => {
    await expect(uniqueSlug(modelWith(["annual-report"]), "Annual Report")).resolves.toBe(
      "annual-report-2"
    );
    await expect(
      uniqueSlug(modelWith(["annual-report", "annual-report-2"]), "Annual Report")
    ).resolves.toBe("annual-report-3");
  });

  it("ignores the record's own slug so renaming a record does not shift it", async () => {
    const model = modelWith(["old-title"]);
    await expect(uniqueSlug(model, "Old Title", "record-1")).resolves.toBe("old-title");
  });

  it("falls back to a safe default when the title has no usable characters", async () => {
    await expect(uniqueSlug(modelWith([]), "!!!")).resolves.toBe("item");
  });
});

describe("toPlainText", () => {
  it("removes tags and decodes the common entities", () => {
    expect(toPlainText("<p>Hello &amp; welcome</p>")).toBe("Hello & welcome");
  });

  it("drops script and style contents rather than leaking them into an excerpt", () => {
    const html = "<p>Safe</p><script>alert(1)</script><style>p{color:red}</style>";
    expect(toPlainText(html)).toBe("Safe");
  });

  it("truncates on a word boundary and appends an ellipsis", () => {
    const result = toPlainText("one two three four five six seven eight", 20);
    expect(result.endsWith("…")).toBe(true);
    expect(result.length).toBeLessThanOrEqual(21);
  });

  it("leaves short text untouched", () => {
    expect(toPlainText("<p>Short</p>", 220)).toBe("Short");
  });
});
