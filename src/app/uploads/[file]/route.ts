/**
 * Serves locally stored uploads at `/uploads/<name>`.
 *
 * `public/` cannot be used for this: Next.js serves it from a file list captured
 * when the server starts, so a file uploaded afterwards 404s until the process
 * restarts. This handler reads from the upload directory on every request, so an
 * upload is live immediately.
 *
 * The route is intentionally narrow. It serves only names the upload module
 * could have written, only regular files, and only with a `Content-Type` taken
 * from a fixed table — never from anything in the request.
 */

import { createReadStream } from "fs";
import { realpath, stat } from "fs/promises";
import path from "path";
import { Readable } from "stream";
import { contentTypeFor, resolveStoredFile, uploadsDir } from "@/lib/upload-storage";

/** Uploads are immutable: each name is unique and never overwritten. */
const CACHE_CONTROL = "public, max-age=31536000, immutable";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ file: string }> }
) {
  const { file } = await params;

  const absolute = resolveStoredFile(file);
  if (!absolute) return notFound();

  const type = contentTypeFor(file);
  if (!type) return notFound();

  let info: Awaited<ReturnType<typeof stat>>;
  try {
    info = await stat(absolute);
  } catch {
    return notFound();
  }

  // Directories and symlinks are refused. A symlink could otherwise point
  // outside the upload directory, so the real path is re-checked for
  // containment before a single byte is read.
  if (!info.isFile()) return notFound();

  try {
    const real = await realpath(absolute);
    const root = await realpath(uploadsDir()).catch(() => uploadsDir());
    if (real !== path.join(root, file)) return notFound();
  } catch {
    return notFound();
  }

  const stream = createReadStream(absolute);
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      "Content-Type": type,
      "Content-Length": String(info.size),
      "Cache-Control": CACHE_CONTROL,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function notFound() {
  return new Response("Not found", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

export const dynamic = "force-dynamic";
