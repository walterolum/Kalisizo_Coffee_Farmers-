import { prisma } from "@/backend/prisma";
import { serviceUnavailable } from "@/shared/http";
import { parsePage, parsePageSize, paginate, jsonPage } from "@/shared/paginate";

/** Published publications for the public downloads page. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  try {
    const page = parsePage(url.searchParams.get("page"));
    const pageSize = parsePageSize(url.searchParams.get("pageSize"), 20);
    const kind = url.searchParams.get("kind")?.trim().toUpperCase();
    const search = url.searchParams.get("q")?.trim().slice(0, 120);

    const where: Record<string, unknown> = {
      status: "PUBLISHED",
      deletedAt: null,
    };
    if (["REPORT", "BROCHURE", "FORM", "POLICY", "OTHER"].includes(kind ?? "")) {
      where.kind = kind;
    }
    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { summary: { contains: search, mode: "insensitive" } },
      ];
    }

    const delegate = prisma.publication;
    const result = await paginate(
      () => delegate.count({ where }),
      (skip, take) =>
        delegate.findMany({
          where,
          orderBy: [{ publishedAt: { sort: "desc", nulls: "last" } }],
          skip,
          take,
        }),
      page,
      pageSize
    );

    return jsonPage(result);
  } catch (error) {
    console.error("[api] GET /api/v1/publications failed:", error);
    return serviceUnavailable("Could not load publications.");
  }
}

export const dynamic = "force-dynamic";
export const revalidate = 0;
