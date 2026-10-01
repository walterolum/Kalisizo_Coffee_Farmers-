import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { broadcastRealtimeUpdate } from "@/lib/realtime-server";
import { v2 as cloudinary } from "cloudinary";
import { adminRateLimit, requirePermission } from "@/lib/admin-guard";
import { sniffImageType } from "@/lib/image-sniff";
import {
  imageExtensionFor,
  localUploadsEnabled,
  newUploadName,
  publicUrlFor,
  uploadsDir,
} from "@/lib/upload-storage";

const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

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

  const folder = `kalisizo-coffee/${user.role === "EDITOR" ? "editor" : "admin"}`;

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  const cloudKey = process.env.CLOUDINARY_API_KEY?.trim();
  const cloudSecret = process.env.CLOUDINARY_API_SECRET?.trim();

  if (cloudName && cloudKey && cloudSecret) {
    cloudinary.config({
      cloud_name: cloudName,
      api_key: cloudKey,
      api_secret: cloudSecret,
    });

    const result = await new Promise<{
      secureUrl: string;
      publicId: string;
    } | null>((resolve) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder, resource_type: "image" },
        (error, uploaded) => {
          if (error || !uploaded) {
            console.error("[api] POST /api/v1/admin/upload (cloudinary):", error);
            resolve(null);
            return;
          }
          resolve({ secureUrl: uploaded.secure_url, publicId: uploaded.public_id });
        }
      );
      stream.end(buffer);
    });

    if (!result) {
      return NextResponse.json(
        { error: "upload_failed", message: "Cloud upload failed. Try again." },
        { status: 502 }
      );
    }
    try { broadcastRealtimeUpdate(); } catch {}
    return NextResponse.json({
      url: result.secureUrl,
      publicId: result.publicId,
      provider: "cloudinary",
    });
  }

  // Local disk storage. This is the development path and the fallback for a
  // self-hosted server with a persistent filesystem. Uploads are written outside
  // `public/` and served by the `/uploads/[file]` route, because `public/` is
  // resolved from a file list captured at server start and would 404 until the
  // process restarted.
  if (!localUploadsEnabled()) {
    console.error(
      "[api] POST /api/v1/admin/upload: no upload backend configured for production."
    );
    return NextResponse.json(
      {
        error: "upload_unavailable",
        message:
          "File uploads are not configured. Set the CLOUDINARY_* variables, or set ALLOW_LOCAL_UPLOADS=true on a server with a persistent filesystem.",
      },
      { status: 503 }
    );
  }

  const ext = imageExtensionFor(file.type);
  if (!ext) {
    return NextResponse.json(
      { error: "validation", message: "Unsupported file type." },
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

  const dir = uploadsDir();
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), buffer);

  try { broadcastRealtimeUpdate(); } catch {}
  console.warn(
    `[api] POST /api/v1/admin/upload: stored ${name} on local disk at ${dir}. ` +
      "Set the CLOUDINARY_* variables to move media off this server."
  );
  return NextResponse.json({
    url: publicUrlFor(name),
    fileName: name,
    provider: "local",
  });
}

export const dynamic = "force-dynamic";