import { prisma } from "@/backend/prisma";
import { serviceUnavailable } from "@/shared/http";
import { parsePage, parsePageSize, paginate, jsonPage } from "@/shared/paginate";

/**
 * Public gallery listing. Optionally filtered by album slug.
 * Returns image metadata only — binaries live in Cloudinary.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  try {
    const page = parsePage(url.searchParams.get("page"));
    const pageSize = parsePageSize(url.searchParams.get("pageSize"), 24);
    const album = url.searchParams.get("album")?.trim() || undefined;

    const where: Record<string, unknown> = {
      status: "PUBLISHED",
      deletedAt: null,
    };
    if (album) where.album = { slug: album };

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
          },
        }),
      page,
      pageSize
    );

    return jsonPage(result);
  } catch (error) {
    console.error("[api] GET /api/v1/gallery failed:", error);
    return serviceUnavailable("Could not load the gallery.");
  }
}

export const dynamic = "force-dynamic";
export const revalidate = 0;
