/**
 * Slug and text helpers shared by the CMS and the public site.
 */

const NON_SLUG = /[^a-z0-9]+/g;

/** Converts a title into a URL-safe slug. */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(NON_SLUG, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

type SlugTarget = { slug: string };

/** Minimal delegate shape needed for slug collision checks. */
type SlugModel = {
  findFirst(args: {
    where: { slug: string; NOT?: { id: string } };
    select: { slug: true };
  }): Promise<SlugTarget | null>;
};

/**
 * Returns a slug that is unique within `model`, appending -2, -3, ... when the
 * base slug is taken. `excludeId` keeps a record's own slug stable when it is
 * being renamed.
 *
 * `reserved` names slugs unavailable for reasons the table cannot know about — for
 * `Page`, the hand-written routes that `/p/[slug]` must not shadow. They are
 * treated exactly like a collision, so `about` becomes `about-2`. See
 * `reserved-slugs.ts` for why suffixing beats rejecting the save.
 */
export async function uniqueSlug(
  model: SlugModel,
  base: string,
  excludeId?: string,
  reserved?: ReadonlySet<string>
): Promise<string> {
  const root = slugify(base) || "item";
  for (let suffix = 1; suffix <= 200; suffix++) {
    const candidate = suffix === 1 ? root : `${root}-${suffix}`;
    // Checked before the query rather than after: a reserved slug can never
    // become available, so asking the database to confirm it is taken is pure cost.
    if (reserved?.has(candidate)) continue;
    const existing = await model.findFirst({
      where: { slug: candidate, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
      select: { slug: true },
    });
    if (!existing) return candidate;
  }
  return `${root}-${Date.now()}`;
}

/** Strips HTML tags so a plain-text excerpt can be derived from rich content. */
export function toPlainText(html: string, maxLength = 220): string {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 80 ? lastSpace : maxLength).trimEnd()}…`;
}
