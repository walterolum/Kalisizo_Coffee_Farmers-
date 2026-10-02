import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/backend/prisma";
import { adminRateLimit, requirePermission } from "@/backend/admin-guard";
import { contentStatusQuery, galleryAlbumSchema } from "@/shared/validators";
import { handleContentWrite, includesSoftDeleted } from "@/backend/admin-content";
import { uniqueSlug } from "@/shared/slug";
import { parsePage, parsePageSize, paginate, jsonPage } from "@/shared/paginate";

/** CMS album list with per-album image counts. */
export async function GET(req: Request) {
  const guard = await requirePermission(req, "viewCms");
  if ("response" in guard) return guard.response;
  const limited = adminRateLimit(req, "gallery-albums:list");
  if (limited) return limited;

  const url = new URL(req.url);
  const page = parsePage(url.searchParams.get("page"));
  const pageSize = parsePageSize(url.searchParams.get("pageSize"), 20);

  const where: Prisma.GalleryAlbumWhereInput = { deletedAt: null };
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

  try {
    const delegate = prisma.galleryAlbum;
    const result = await paginate(
      () => delegate.count({ where }),
      (skip, take) =>
        delegate.findMany({
          where,
          orderBy: [{ displayOrder: "asc" }, { title: "asc" }],
          skip,
          take,
          include: { _count: { select: { images: true } } },
        }),
      page,
      pageSize
    );
    return jsonPage(result);
  } catch (error) {
    console.error("[api] GET /api/v1/admin/gallery/albums failed:", error);
    return NextResponse.json(
      { error: "service_unavailable", message: "Could not load albums." },
      { status: 503 }
    );
  }
}

/** Create or update an album. */
export async function POST(req: Request) {
  return handleContentWrite({
    req,
    model: "galleryAlbum",
    targetType: "gallery-album",
    collection: "gallery",
    schema: galleryAlbumSchema,
    titleOf: (r) => String(r.title ?? ""),
    toData: (input) => ({
      title: input.title,
      description: input.description || null,
      coverImageUrl: input.coverImageUrl || null,
      displayOrder: input.displayOrder ?? 0,
    }),
    afterWrite: async (record, input) => {
      if (!record.slug) {
        const slug = await uniqueSlug(prisma.galleryAlbum, input.slug || input.title);
        await prisma.galleryAlbum.update({
          where: { id: String(record.id) },
          data: { slug },
        });
      }
    },
  });
}

export const dynamic = "force-dynamic";
