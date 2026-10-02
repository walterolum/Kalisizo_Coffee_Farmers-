import { prisma } from "@/backend/prisma";
import { serviceUnavailable } from "@/shared/http";
import { parsePage, parsePageSize, paginate, jsonPage } from "@/shared/paginate";
import { listEvents, isUpcoming } from "@/backend/content";

/** Public event listing. `upcoming=true` returns only events that have not ended. */
export async function GET(req: Request) {
  const url = new URL(req.url);

  try {
    const page = parsePage(url.searchParams.get("page"));
    const pageSize = parsePageSize(url.searchParams.get("pageSize"));
    const upcomingOnly = url.searchParams.get("upcoming") === "true";

    const { where, orderBy } = await listEvents({ page, pageSize, upcomingOnly });

    const delegate = prisma.event;
    const result = await paginate(
      () => delegate.count({ where }),
      (skip, take) => delegate.findMany({ where, orderBy, skip, take }),
      page,
      pageSize
    );

    // Annotate each item so the UI can label past vs upcoming without
    // recomputing the comparison in the browser.
    return jsonPage({
      ...result,
      items: result.items.map((e) => ({
        ...e,
        isUpcoming: isUpcoming(e.startAt, e.endAt),
      })),
    });
  } catch (error) {
    console.error("[api] GET /api/v1/events failed:", error);
    return serviceUnavailable("Could not load events.");
  }
}

export const dynamic = "force-dynamic";
export const revalidate = 0;
