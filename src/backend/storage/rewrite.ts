/**
 * Rewriting persisted upload URLs.
 *
 * Moving uploads to a different backend is two operations, and only one of them
 * is obviously a file copy. The CMS stores a *URL* against every image, so the
 * files moving is the easy half; the hard half is that 23 columns across the
 * schema hold `/uploads/<name>` values that must all be repointed at the new
 * location or every image on the site breaks at once.
 *
 * This module is the decision logic for that rewrite, kept separate from the
 * script that performs it so it can be tested without a database or a bucket.
 *
 * The matching is deliberately exact rather than a substring replacement:
 *
 *   - `/pictures/coffee-farms.jpg` and `/images/logo.png` live in `public/` and
 *     are served by the app itself. A naive `replace('/uploads/', ...)` or a
 *     `LIKE '%/uploads/%'` would not touch them, but a broader "rewrite anything
 *     that looks like a path" would, and that would be data loss.
 *   - An already-absolute URL means the row was migrated already. Rewriting it
 *     again would be a no-op at best and a corruption at worst, so it is left
 *     alone and the script can be run more than once.
 *   - A `/uploads/` value that does not match the stored-name allowlist is left
 *     alone and reported, because it is either corrupt or was written by hand.
 */

import { isStoredName, publicUrlFor, UPLOAD_URL_PREFIX } from "@/backend/upload-storage";

/**
 * A locally-served upload URL, with any query string or fragment captured
 * separately so it can be preserved.
 *
 * Anchored so a path that merely contains `/uploads/` somewhere in the middle is
 * not matched, and so a value with a trailing segment (`/uploads/a.jpg/b`) does
 * not match either.
 *
 * A cache-buster is a real thing editors paste, so the suffix is kept rather than
 * dropped: rewriting `/uploads/x.jpg?v=2` to a bare bucket URL would silently
 * change how that image is cached.
 */
const LOCAL_UPLOAD_URL = new RegExp(`^${UPLOAD_URL_PREFIX}/([^/?#]+)([?#].*)?$`);

/** Any value that sits under the upload prefix at all. */
const UNDER_UPLOAD_PREFIX = `${UPLOAD_URL_PREFIX}/`;

/** What `planUrlRewrite` decided about one value. */
export type UrlRewritePlan =
  /** Leave the value exactly as it is. */
  | { action: "keep" }
  /** Replace the whole value with this one. */
  | { action: "rewrite"; from: string; to: string; name: string }
  /**
   * Looks like a local upload but is not a name this module could have written.
   * Needs a human: rewriting it would guess, and skipping it silently would
   * leave a broken image.
   */
  | { action: "suspicious"; reason: string };

/**
 * Decides what should happen to a single stored value.
 *
 * @param value  The column value, or null.
 * @param urlsByName  Stored name to the URL it should now be served from. A name
 *   absent from this map has not been uploaded yet, so its reference is left
 *   pointing at the old location until it is.
 */
export function planUrlRewrite(
  value: string | null | undefined,
  urlsByName: ReadonlyMap<string, string>
): UrlRewritePlan {
  if (value === null || value === undefined || value === "") {
    return { action: "keep" };
  }

  // A value under the upload prefix is this application's responsibility whether
  // or not it parses. Anything that fails to match the strict shape is reported
  // rather than skipped, because a corrupt value under our own prefix is
  // something a human should see. Skipping it silently is how a broken image
  // survives a migration unnoticed.
  if (!value.startsWith(UNDER_UPLOAD_PREFIX)) {
    // Not ours: a `public/` path, an absolute URL from an earlier migration, or a
    // Cloudinary URL. All of these must be left exactly as they are.
    return { action: "keep" };
  }

  const match = LOCAL_UPLOAD_URL.exec(value);
  if (!match) {
    return {
      action: "suspicious",
      reason: `\`${value}\` sits under ${UPLOAD_URL_PREFIX}/ but is not a single well-formed stored name`,
    };
  }

  const name = match[1];
  if (!isStoredName(name)) {
    return {
      action: "suspicious",
      reason: `\`${value}\` sits under ${UPLOAD_URL_PREFIX}/ but is not a well-formed stored name`,
    };
  }

  const base = urlsByName.get(name);
  if (!base) {
    // The file has not been uploaded to the new backend. Leaving the old URL in
    // place is the correct outcome: it still resolves while the local backend is
    // still serving.
    return { action: "keep" };
  }

  return { action: "rewrite", from: value, to: `${base}${match[2] ?? ""}`, name };
}

/**
 * Builds the name to URL map from what the new backend returned.
 *
 * Takes the *returned* URLs rather than reconstructing them, because the backends
 * genuinely differ: Supabase derives a path from the project URL and bucket,
 * Cloudinary returns its own `public_id` and `secure_url`, and local returns a
 * root-relative path. Reconstructing them here would reintroduce the assumption
 * the adapter exists to remove.
 */
export function buildUrlMap(
  stored: ReadonlyArray<{ name: string; url: string }>
): Map<string, string> {
  return new Map(stored.map((entry) => [entry.name, entry.url]));
}

/** A row that will change, for review before anything is written. */
export type PendingRewrite = {
  table: string;
  column: string;
  /** Primary key value, as a string, for identifying the row. */
  id: string;
  from: string;
  to: string;
};

/**
 * Every column that may hold an image URL.
 *
 * Discovered from `information_schema` rather than hard-coded, so a model added
 * later is included automatically instead of being silently missed. The filter
 * matches the naming convention the schema already uses (`imageUrl`, `photoUrl`,
 * `logoUrl`, `fileUrl`, `coverImageUrl`, `thumbnailUrl`, `backgroundImage`,
 * `linkUrl`), which is a convention rather than a guarantee — hence the
 * `suspicious` reporting above, and the review step before any write.
 */
export const URL_COLUMN_SQL = `
  SELECT c.table_name, c.column_name
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.data_type IN ('text', 'character varying')
    AND (
      c.column_name ILIKE '%image%'
      OR c.column_name ILIKE '%url%'
      OR c.column_name ILIKE '%logo%'
      OR c.column_name ILIKE '%photo%'
    )
  ORDER BY c.table_name, c.column_name
`;

/**
 * The `id` columns of every table holding a URL, for use as a row identifier in
 * a review listing.
 *
 * Queried rather than assumed: `SocialLink` and a few others do not have a plain
 * single-column `id`, and a rewrite that could not name the row it was about to
 * change would be unreviewable.
 */
export const TABLE_ID_SQL = `
  SELECT c.table_name, c.column_name AS id_column
  FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.column_name = 'id'
  ORDER BY c.table_name
`;

/** The `/uploads/<name>` value currently stored, if any, for a row. */
export const UPLOAD_PREFIX_LIKE = `${UPLOAD_URL_PREFIX}/%`;

/** Reconstructs the URL a local upload is served from today. Used for reporting. */
export function currentLocalUrl(name: string): string {
  return publicUrlFor(name);
}
