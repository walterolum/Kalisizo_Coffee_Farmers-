/**
 * Local disk storage for admin image uploads.
 *
 * Uploads are written to a directory *outside* `public/` and served back through
 * the `/uploads/[file]` route handler. That split is deliberate: Next.js resolves
 * `public/` from a file list captured when the server boots, so a file written
 * into `public/uploads/` after startup is not served and 404s until the process
 * restarts. Streaming from the storage directory keeps uploads working for the
 * lifetime of the process, in both dev and production.
 *
 * Cloudinary remains the preferred production backend; when the `CLOUDINARY_*`
 * variables are set the upload route never reaches this module.
 */

import path from "path";
import crypto from "crypto";

/** Image types the upload route accepts, mapped to the extension we store. */
const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

/**
 * Reverse map, used only when serving. Deriving the `Content-Type` from a fixed
 * table rather than from anything the request supplies is what keeps an upload
 * from ever being served as active content.
 */
const TYPE_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

/**
 * The exact shape of a stored filename: `<timestamp>-<8 hex>.<ext>`.
 *
 * A strict allowlist is the primary defence against path traversal: `/`, `\`,
 * `..` and null bytes cannot match, so a hostile `file` segment is rejected
 * before it ever reaches the filesystem. `resolveStoredFile` re-checks
 * containment as a second line of defence.
 */
const STORED_NAME = /^\d{10,17}-[0-9a-f]{8}\.(jpg|png|webp|gif)$/;

/** The URL prefix the serving route is mounted at. */
export const UPLOAD_URL_PREFIX = "/uploads";

/** The extension to store an accepted upload type under, or null if rejected. */
export function imageExtensionFor(type: string): string | null {
  return EXT_BY_TYPE[type] ?? null;
}

/** The `Content-Type` to serve a stored file with, or null if unrecognised. */
export function contentTypeFor(name: string): string | null {
  const match = STORED_NAME.exec(name);
  if (!match) return null;
  return TYPE_BY_EXT[match[1]];
}

/** Builds the collision-resistant on-disk name for a new upload. */
export function newUploadName(type: string): string | null {
  const ext = imageExtensionFor(type);
  if (!ext) return null;
  return `${Date.now()}-${crypto.randomBytes(4).toString("hex")}.${ext}`;
}

/** Whether `name` is a well-formed stored filename. */
export function isStoredName(name: string): boolean {
  return STORED_NAME.test(name);
}

/** The public URL an uploaded file is served from. */
export function publicUrlFor(name: string): string {
  return `${UPLOAD_URL_PREFIX}/${name}`;
}

let warnedAboutPublicDir = false;

/**
 * Absolute path to the upload directory. `UPLOAD_DIR` may be absolute (a mounted
 * volume) or relative to the project root; the default keeps uploads with the
 * other mutable local data rather than inside the build output.
 *
 * The `turbopackIgnore` comments below are deliberate. `UPLOAD_DIR` is read at
 * runtime precisely so an operator can point uploads at a mounted volume, which
 * means the path cannot be known when the bundle is built. Without the opt-outs
 * Turbopack assumes the dynamic path may reach anywhere and traces the entire
 * project — including `public/` — into the server output. Marking these calls
 * keeps the build output scoped instead.
 */
export function uploadsDir(): string {
  const configured = process.env.UPLOAD_DIR?.trim();
  return path.resolve(/* turbopackIgnore: true */ process.cwd(), configured || "data/uploads");
}

/**
 * Resolves a requested filename to an absolute path, or null when the name is
 * not one this module could have written. Callers must treat null as a 404.
 */
export function resolveStoredFile(name: string): string | null {
  if (!isStoredName(name)) return null;

  const dir = uploadsDir();
  const absolute = path.resolve(/* turbopackIgnore: true */ dir, name);

  // Belt and braces alongside the allowlist above.
  if (absolute !== path.join(/* turbopackIgnore: true */ dir, name)) return null;

  const publicDir = path.resolve(/* turbopackIgnore: true */ process.cwd(), "public");
  if (!warnedAboutPublicDir && absolute.startsWith(publicDir + path.sep)) {
    warnedAboutPublicDir = true;
    console.warn(
      "[upload] UPLOAD_DIR is inside public/. Next.js only serves files that " +
        "were present in public/ when the server started, so uploads written " +
        "after startup will 404. Point UPLOAD_DIR somewhere else."
    );
  }

  return absolute;
}

const TRUTHY = new Set(["1", "true", "yes", "on"]);

/**
 * Parses an environment flag. Only the listed values count as enabled, so
 * `ALLOW_LOCAL_UPLOADS="false"` is honoured instead of being truthy as a string.
 */
export function parseBoolean(value: string | undefined): boolean {
  return TRUTHY.has(value?.trim().toLowerCase() ?? "");
}

/**
 * Whether uploads may be written to local disk. Development always may; in
 * production it has to be opted into, because an ephemeral or read-only
 * filesystem would silently lose every uploaded image.
 */
export function localUploadsEnabled(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  return parseBoolean(process.env.ALLOW_LOCAL_UPLOADS);
}
