import { prisma } from "@/lib/prisma";
import { serviceUnavailable } from "@/lib/http";
import { parsePage, parsePageSize, paginate, jsonPage } from "@/lib/paginate";
import { listProjects } from "@/lib/content";

/** Public project listing. Only PUBLISHED, non-deleted projects are returned. */
export async function GET(req: Request) {
  const url = new URL(req.url);

  try {
    const page = parsePage(url.searchParams.get("page"));
    const pageSize = parsePageSize(url.searchParams.get("pageSize"));
    const stage = url.searchParams.get("stage")?.trim().toUpperCase() || undefined;
    const category = url.searchParams.get("category")?.trim() || undefined;
    const search = url.searchParams.get("q")?.trim().slice(0, 120) || undefined;

    const { where, orderBy } = await listProjects({ page, pageSize, stage });
    if (category) where.category = { slug: category };
    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { summary: { contains: search, mode: "insensitive" } },
        { location: { contains: search, mode: "insensitive" } },
      ];
    }

    const delegate = prisma.project;
    const result = await paginate(
      () => delegate.count({ where }),
      (skip, take) =>
        delegate.findMany({
          where,
          orderBy,
          skip,
          take,
          include: {
            category: { select: { id: true, name: true, slug: true } },
            _count: { select: { images: true } },
          },
        }),
      page,
      pageSize
    );

    return jsonPage(result);
  } catch (error) {
    console.error("[api] GET /api/v1/projects failed:", error);
    return serviceUnavailable("Could not load projects.");
  }
}

export const dynamic = "force-dynamic";
export const revalidate = 0;
