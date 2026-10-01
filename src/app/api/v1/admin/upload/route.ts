import { NextResponse } from "next/server";
import { broadcastRealtimeUpdate } from "@/lib/realtime-server";
import { adminRateLimit, requirePermission } from "@/lib/admin-guard";
import { sniffImageType } from "@/lib/image-sniff";
import { newUploadName } from "@/lib/upload-storage";
import { getStorageBackend, storageStatus } from "@/lib/storage";

const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

/**
 * Accepts an image and hands it to the configured storage backend.
 *
 * Validation stays in this route rather than moving behind the storage
 * interface, so there is exactly one place that decides what is an acceptable
 * upload regardless of which backend is configured. The backends deliberately
 * receive bytes that are already known to be an image of the declared type.
 */
export async function POST(req: Request) {
  const guard = await requirePermission(req, "manageMedia");
  if ("response" in guard) return guard.response;
  const user = guard.user;
  const limited = adminRateLimit(req, "upload", 30, 15 * 60_000);
  if (limited) return limited;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "validation", message: "Multipart form data expected." },
      { status: 400 }
    );
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json(
      { error: "validation", message: 'A "file" field is required.' },
      { status: 400 }
    );
  }
  if (!ACCEPTED_TYPES.has(file.type)) {
    return NextResponse.json(
      {
        error: "validation",
        message: "Unsupported file type. Use JPEG, PNG, WebP or GIF.",
      },
      { status: 400 }
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "validation", message: "File exceeds the 8 MB limit." },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // The declared type is not trustworthy, so confirm the bytes really are an
  // image of that type. This is what stops an HTML or SVG payload uploaded with
  // a spoofed `image/png` header from being served as active content.
  const sniffed = sniffImageType(buffer);
  if (!sniffed || sniffed !== file.type) {
    return NextResponse.json(
      {
        error: "validation",
        message: `File contents do not match a ${file.type} upload. Use a real JPEG, PNG, WebP or GIF image.`,
      },
      { status: 400 }
    );
  }

  const name = newUploadName(file.type);
  if (!name) {
    return NextResponse.json(
      { error: "validation", message: "Could not build a filename for this upload." },
      { status: 400 }
    );
  }

  const backend = getStorageBackend();
  if (!backend) {
    // Name the missing configuration rather than failing somewhere inside a
    // write. This is the response a deployment with no storage configured gets.
    const status = storageStatus();
    console.error(
      "[api] POST /api/v1/admin/upload: no storage backend configured.",
      status
    );
    return NextResponse.json(
      {
        error: "upload_unavailable",
        message: status.problem
          ? `File uploads are not available. ${status.problem}`
          : "File uploads are not configured on this server.",
      },
      { status: 503 }
    );
  }

  const folder = `kalisizo-coffee/${user.role === "EDITOR" ? "editor" : "admin"}`;

  let stored;
  try {
    stored = await backend.put({
      key: name,
      body: buffer,
      contentType: file.type,
      folder,
    });
  } catch (error) {
    console.error(
      `[api] POST /api/v1/admin/upload (${backend.name}) failed:`,
      error
    );
    return NextResponse.json(
      { error: "upload_failed", message: "Upload failed. Please try again." },
      { status: 502 }
    );
  }

  try {
    broadcastRealtimeUpdate();
  } catch {
    /* realtime is best-effort and must not fail the upload */
  }

  return NextResponse.json({
    // `url` is the field the CMS persists and renders. It must keep working for
    // content stored before this change, which is why the local backend still
    // returns a `/uploads/...` path.
    url: stored.url,
    key: stored.key,
    provider: backend.name,
  });
}

export const dynamic = "force-dynamic";