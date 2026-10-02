import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/backend/prisma";
import { adminRateLimit, requirePermission } from "@/backend/admin-guard";
import { contentStatusQuery, galleryImageSchema } from "@/shared/validators";
import { handleContentWrite, includesSoftDeleted } from "@/backend/admin-content";
import { parsePage, parsePageSize, paginate, jsonPage } from "@/shared/paginate";

/** CMS image list. Returns metadata only — binaries live in Cloudinary. */
export async function GET(req: Request) {
  const guard = await requirePermission(req, "viewCms");
  if ("response" in guard) return guard.response;
  const limited = adminRateLimit(req, "gallery-images:list");
  if (limited) return limited;

  const url = new URL(req.url);
  const page = parsePage(url.searchParams.get("page"));
  const pageSize = parsePageSize(url.searchParams.get("pageSize"), 24);

  const where: Prisma.GalleryImageWhereInput = { deletedAt: null };
  const rawStatus = url.searchParams.get("status");
  if (rawStatus) {
    const parsed = contentStatusQuery.safeParse(rawStatus);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "validation", message: "Invalid status filter." },
        { status: 400 }
      );
    }
    where.status = parsed.data;
    if (includesSoftDeleted(parsed.data)) delete where.deletedAt;
  }
  const album = url.searchParams.get("album")?.trim();
  if (album) where.album = { slug: album };

  try {
    const delegate = prisma.galleryImage;
    const result = await paginate(
      () => delegate.count({ where }),
      (skip, take) =>
        delegate.findMany({
          where,
          orderBy: [{ displayOrder: "asc" }, { createdAt: "desc" }],
          skip,
          take,
          include: {
            album: { select: { id: true, title: true, slug: true } },
            uploadedBy: { select: { id: true, name: true } },
          },
        }),
      page,
      pageSize
    );
    return jsonPage(result);
  } catch (error) {
    console.error("[api] GET /api/v1/admin/gallery/images failed:", error);
    return NextResponse.json(
      { error: "service_unavailable", message: "Could not load images." },
      { status: 503 }
    );
  }
}

/** Create or update a gallery image record. */
export async function POST(req: Request) {
  return handleContentWrite({
    req,
    model: "galleryImage",
    targetType: "gallery-image",
    collection: "gallery",
    schema: galleryImageSchema,
    titleOf: (r) => String(r.caption || r.alt || ""),
    toData: (input) => ({
      url: input.url,
      thumbnailUrl: input.thumbnailUrl || null,
      alt: input.alt,
      caption: input.caption || null,
      description: input.description || null,
      albumId: input.albumId || null,
      projectId: input.projectId || null,
      displayOrder: input.displayOrder ?? 0,
    }),
  });
}

export const dynamic = "force-dynamic";
