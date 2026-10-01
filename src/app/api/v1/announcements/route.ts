import { prisma } from "@/lib/prisma";
import { serviceUnavailable } from "@/lib/http";
import { parsePage, parsePageSize, paginate, jsonPage } from "@/lib/paginate";

/** Published announcement archive for the public announcements page. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  try {
    const page = parsePage(url.searchParams.get("page"));
    const pageSize = parsePageSize(url.searchParams.get("pageSize"), 20);
    const severity = url.searchParams.get("severity")?.trim().toUpperCase();

    const where: Record<string, unknown> = {
      status: "PUBLISHED",
      deletedAt: null,
    };
    if (severity === "INFO" || severity === "WARNING" || severity === "CRITICAL") {
      where.severity = severity;
    }

    const delegate = prisma.announcement;
    const result = await paginate(
      () => delegate.count({ where }),
      (skip, take) =>
        delegate.findMany({
          where,
          orderBy: [{ isPinned: "desc" }, { startsAt: "desc" }],
          skip,
          take,
        }),
      page,
      pageSize
    );

    return jsonPage(result);
  } catch (error) {
    console.error("[api] GET /api/v1/announcements failed:", error);
    return serviceUnavailable("Could not load announcements.");
  }
}

export const dynamic = "force-dynamic";
export const revalidate = 0;
