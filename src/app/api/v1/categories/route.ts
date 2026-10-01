import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { serviceUnavailable } from "@/lib/http";
import { parsePage, parsePageSize, paginate, jsonPage } from "@/lib/paginate";

/** News categories for the category filter. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  try {
    const page = parsePage(url.searchParams.get("page"));
    const pageSize = parsePageSize(url.searchParams.get("pageSize"), 50);
    const where: Prisma.CategoryWhereInput = {
      articles: { some: { status: "PUBLISHED", deletedAt: null } },
    };

    const delegate = prisma.category;
    const result = await paginate(
      () => delegate.count({ where }),
      (skip, take) =>
        delegate.findMany({
          where,
          orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
          skip,
          take,
          include: { _count: { select: { articles: true } } },
        }),
      page,
      pageSize
    );

    return jsonPage(result);
  } catch (error) {
    console.error("[api] GET /api/v1/categories failed:", error);
    return serviceUnavailable("Could not load categories.");
  }
}

export const dynamic = "force-dynamic";
export const revalidate = 0;
