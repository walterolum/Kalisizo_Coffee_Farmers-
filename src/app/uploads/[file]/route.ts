/**
 * Serves locally stored uploads at `/uploads/<name>`.
 *
 * `public/` cannot be used for this: Next.js serves it from a file list captured
 * when the server starts, so a file uploaded afterwards 404s until the process
 * restarts. This handler reads from the storage backend on every request, so an
 * upload is live immediately.
 *
 * This route exists for the *local* backend only. Supabase and Cloudinary return
 * absolute public URLs, so their objects are fetched directly from those origins
 * and never pass through here. The route is kept because the CMS already has
 * `/uploads/<name>` values stored against it, and those have to keep resolving.
 *
 * The route is intentionally narrow. It serves only names the upload module
 * could have written, only regular files, and only with a `Content-Type` taken
 * from a fixed table - never from anything in the request.
 */

import { NextResponse } from "next/server";
import { isStoredName } from "@/backend/upload-storage";
import { getStorageBackend } from "@/backend/storage";

/** Uploads are immutable: each name is unique and never overwritten. */
const CACHE_CONTROL = "public, max-age=31536000, immutable";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ file: string }> }
) {
  const { file } = await params;

  // The name allowlist is a security boundary, not a naming convention: anything
  // it rejects never reaches a filesystem or a bucket. The backend re-checks it
  // too.
  if (!isStoredName(file)) return notFound();

  const backend = getStorageBackend();
  if (!backend || backend.name !== "local") {
    // A `/uploads/...` URL only means anything while local disk is the backend.
    // If it is not, those URLs belong to a different origin and returning 404 is
    // the honest answer — the object's real URL is what the CMS stores now.
    return notFound();
  }

  let object;
  try {
    object = await backend.get(file);
  } catch (error) {
    console.error(`[uploads] GET /uploads/${file} failed:`, error);
    return notFound();
  }

  if (!object) return notFound();

  const headers: Record<string, string> = {
    "Content-Type": object.contentType,
    "Cache-Control": CACHE_CONTROL,
    "X-Content-Type-Options": "nosniff",
  };
  if (typeof object.size === "number") headers["Content-Length"] = String(object.size);
  if (object.etag) headers.ETag = object.etag;

  return new NextResponse(object.body, { headers });
}

function notFound() {
  return new Response("Not found", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

export const dynamic = "force-dynamic";