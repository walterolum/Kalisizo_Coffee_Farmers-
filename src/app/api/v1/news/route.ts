import { prisma } from "@/lib/prisma";
import { serviceUnavailable } from "@/lib/http";
import { parsePage, parsePageSize, paginate, jsonPage } from "@/lib/paginate";
import { listNews } from "@/lib/content";

/**
 * Public news listing. Only PUBLISHED, non-deleted articles are ever returned.
 * Supports pagination, category/tag filters and free-text search.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);

  try {
    const page = parsePage(url.searchParams.get("page"));
    const pageSize = parsePageSize(url.searchParams.get("pageSize"));
    const category = url.searchParams.get("category")?.trim() || undefined;
    const tag = url.searchParams.get("tag")?.trim() || undefined;
    const search = url.searchParams.get("q")?.trim().slice(0, 120) || undefined;
    const featuredOnly = url.searchParams.get("featured") === "true";

    const { where, orderBy } = await listNews({
      page,
      pageSize,
      categorySlug: category,
      tag,
      search,
      featuredOnly,
    });

    const delegate = prisma.newsArticle;
    const result = await paginate(
      () => delegate.count({ where }),
      (skip, take) =>
        delegate.findMany({
          where,
          orderBy,
          skip,
          take,
          include: {
            author: { select: { id: true, name: true } },
            category: { select: { id: true, name: true, slug: true } },
          },
        }),
      page,
      pageSize
    );

    return jsonPage(result);
  } catch (error) {
    console.error("[api] GET /api/v1/news failed:", error);
    return serviceUnavailable("Could not load news articles.");
  }
}

export const dynamic = "force-dynamic";
export const revalidate = 0;
