/**
 * HTML sanitisation for CMS-authored rich text.
 *
 * ## Why this module exists
 *
 * Five public pages render CMS body copy with `dangerouslySetInnerHTML`:
 * `news/[slug]`, `projects/[slug]`, `events/[slug]`, `programs/[slug]` and
 * `CmsContentPage` (the `/p/[slug]` route). Until this module existed, the value
 * written by the CMS reached the browser untouched, so any account holding the
 * `editContent` permission — including the lowest role, `EDITOR` — could store
 * `<script>` or an `onerror=` handler and have it execute for every anonymous
 * visitor the moment the item was published. That is stored cross-site scripting,
 * and it turned the site into a credential-harvesting host for anyone who
 * followed a link to an article.
 *
 * ## Why it is an allowlist
 *
 * The policy below names the tags and attributes an editor may use. Everything
 * else is discarded. A blocklist — "strip `<script>`", "strip `on*=`" — cannot
 * be made safe, because browsers keep finding ways to run code from markup:
 * `javascript:` URLs, `srcdoc`, `formaction`, SVG `<use xlink:href>`, and parser
 * differentials between what a sanitiser sees and what a browser executes. An
 * allowlist fails closed: a tag nobody anticipated is simply not permitted.
 *
 * `script`, `style`, `iframe`, `object`, `embed` and `form` are named explicitly
 * in `nonTextTags` only so the reason is legible to the next reader —
 * `sanitize-html` already drops every tag absent from the allowlist, and the
 * whole element is discarded rather than unwrapped so that
 * `<script>alert(1)</script>` does not survive as the visible words "alert(1)".
 *
 * ## Why it is keyed by model, not by field name
 *
 * Several models have a `description` column, and most of them are *not* rich
 * text: `Product`, `SuccessStory`, `LeadershipMember` and `SocialLink` render
 * theirs as a React text node, where an ampersand is already safe. Escaping
 * those would display `Tips &amp; Tricks` literally, so sanitising on field name
 * alone would corrupt ordinary copy on four models. The list below therefore
 * names the exact model/field pairs that reach `dangerouslySetInnerHTML`.
 *
 * `tests/sanitize.test.ts` reads the public route sources, collects every
 * `dangerouslySetInnerHTML` binding, and fails if one is missing from this map —
 * so a new rich-text field cannot be added without also being sanitised.
 *
 * ## Where it is applied
 *
 * At the write boundary, in `handleContentWrite` (`@/backend/admin-content`), before
 * the value reaches Prisma. Sanitising on write rather than on render means the
 * database never holds a payload, so the audit log, the API response, the
 * optimistic-concurrency comparison and the public page all see the same safe
 * value. Sanitising on render would leave a live `<script>` in the table and in
 * every export of the content.
 */

import sanitizeHtml from "sanitize-html";

/**
 * Tags an editor may use in a rich-text body.
 *
 * This is the vocabulary the public stylesheet and the `.prose-article` rules in
 * `globals.css` were written for. Anything outside it renders as unstyled text or
 * is dropped, which is the right outcome for a cooperative's editorial content.
 */
const ALLOWED_TAGS = [
  // Structure and text
  "p",
  "br",
  "hr",
  "div",
  "span",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "small",
  "sub",
  "sup",
  "mark",
  // Headings — `h1` is omitted because the page already supplies one, and two
  // `h1`s per document breaks the heading outline.
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  // Lists
  "ul",
  "ol",
  "li",
  "dl",
  "dt",
  "dd",
  // Links and quoting
  "a",
  "blockquote",
  // Tables
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "th",
  "td",
  "caption",
  "colgroup",
  "col",
  // Media
  "img",
  "figure",
  "figcaption",
  "picture",
  "source",
];

/**
 * Attributes permitted on any allowed tag.
 *
 * `style` is deliberately absent. Inline CSS is the standard way to smuggle
 * `position: fixed` overlays and clickjacking panes past a tag allowlist, and the
 * design system does not need it — the public pages use utility classes in their
 * components, never inline styles in CMS copy.
 */
const ALLOWED_ATTRIBUTES: sanitizeHtml.IOptions["allowedAttributes"] = {
  a: ["href", "title", "target", "rel"],
  img: ["src", "srcset", "sizes", "alt", "title", "width", "height", "loading", "decoding"],
  source: ["srcset", "sizes", "type", "media"],
  td: ["colspan", "rowspan", "headers", "scope", "class"],
  th: ["colspan", "rowspan", "headers", "scope", "abbr", "class"],
  col: ["span"],
  colgroup: ["span"],
  ol: ["start", "reversed", "type"],
  p: ["class"],
  div: ["class"],
  span: ["class"],
  h2: ["class"],
  h3: ["class"],
  h4: ["class"],
  h5: ["class"],
  h6: ["class"],
  ul: ["class"],
  li: ["class"],
  blockquote: ["cite"],
  figure: ["class"],
  figcaption: ["class"],
  table: ["class"],
  thead: ["class"],
  tbody: ["class"],
  tr: ["class"],
};

/**
 * URL schemes permitted in `href`/`src`.
 *
 * Excluding `javascript:`, `data:` and `vbscript:` is what stops an
 * `<a href="javascript:…">` from being a click-to-execute payload and an
 * `<img src="data:text/html,…">` from being a same-origin document.
 */
const ALLOWED_SCHEMES = ["http", "https", "mailto", "tel"];

/** Union of `rel` tokens, so an editor's own `nofollow` survives. */
function mergeRel(existing: unknown): string {
  const tokens = new Set(
    String(existing ?? "")
      .split(/\s+/)
      .filter(Boolean)
  );
  tokens.add("noopener");
  tokens.add("noreferrer");
  return [...tokens].join(" ");
}

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: ALLOWED_ATTRIBUTES,
  allowedSchemes: ALLOWED_SCHEMES,
  transformTags: {
    a: (tagName, attribs) => {
      // `target="_blank"` without `rel` hands `window.opener` to the destination.
      // Rather than rewriting every link, `rel` is only added where it matters
      // and the redundant `target` is dropped elsewhere.
      if (String(attribs.target).toLowerCase() !== "_blank") {
        const rest: Record<string, string> = { ...attribs };
        delete rest.target;
        return { tagName, attribs: rest };
      }
      return { tagName, attribs: { ...attribs, rel: mergeRel(attribs.rel) } };
    },
  },
  nonTextTags: [
    "script",
    "style",
    "textarea",
    "option",
    "noscript",
    "title",
    "iframe",
    "object",
    "embed",
    "applet",
    "template",
  ],
  disallowedTagsMode: "discard",
};

/**
 * The exact model/field pairs that are rendered as HTML on a public page.
 *
 * Every entry is justified by a `dangerouslySetInnerHTML` in `src/app/(site)` or
 * `src/frontend/components/CmsContentPage.tsx`:
 *
 * | model         | field        | rendered as HTML at                       |
 * |---------------|--------------|-------------------------------------------|
 * | `newsArticle` | `content`    | `(site)/news/[slug]/page.tsx`            |
 * | `event`       | `description`| `(site)/events/[slug]/page.tsx`           |
 * | `project`     | `description`| `(site)/projects/[slug]/page.tsx`         |
 * | `page`        | `content`    | `components/CmsContentPage.tsx` (`/p/*`) |
 * | `service`     | `content`    | `(site)/programs/[slug]/page.tsx`         |
 *
 * `service.content` is the one entry not declared `kind: "html"` in
 * `admin-fields.ts`, because programs are edited by `ProgramsPanel` rather than
 * the generic editor. It is listed here because the page renders it as HTML.
 */
const RICH_TEXT_FIELDS: Readonly<Record<string, readonly string[]>> = {
  newsArticle: ["content"],
  event: ["description"],
  project: ["description"],
  page: ["content"],
  service: ["content"],
};

/** The model/field pairs sanitised on write, for tests and for the CMS copy. */
export function richTextFieldMap(): Record<string, readonly string[]> {
  return Object.fromEntries(
    Object.entries(RICH_TEXT_FIELDS).map(([model, fields]) => [model, [...fields]])
  );
}

/** True when `model`.`field` is rendered as HTML and must be sanitised. */
export function isRichTextField(model: string, field: string): boolean {
  return RICH_TEXT_FIELDS[model]?.includes(field) ?? false;
}

/** Strips every script-bearing construct, keeping the safe formatting. */
export function sanitizeRichText(value: string): string {
  if (!value) return value;
  return sanitizeHtml(value, OPTIONS);
}

/**
 * Sanitises the rich-text fields of one content row about to be written.
 *
 * Mutates and returns `data` so it can be spread in place. Only the fields
 * listed for `model` are touched; every other string on the row is rendered by
 * React as a text node and is already safe, and escaping those would corrupt
 * ordinary copy.
 */
export function sanitizeContentRow<T extends Record<string, unknown>>(
  model: string,
  data: T
): T {
  for (const field of RICH_TEXT_FIELDS[model] ?? []) {
    const value = data[field];
    if (typeof value === "string") {
      (data as Record<string, unknown>)[field] = sanitizeRichText(value);
    }
  }
  return data;
}
