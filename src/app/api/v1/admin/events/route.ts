import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/backend/prisma";
import { adminRateLimit, requirePermission } from "@/backend/admin-guard";
import { contentStatusQuery, eventSchema } from "@/shared/validators";
import { handleContentWrite, includesSoftDeleted } from "@/backend/admin-content";
import { uniqueSlug } from "@/shared/slug";
import { parsePage, parsePageSize, paginate, jsonPage } from "@/shared/paginate";

/** CMS event list, including drafts. */
export async function GET(req: Request) {
  const guard = await requirePermission(req, "viewCms");
  if ("response" in guard) return guard.response;
  const limited = adminRateLimit(req, "events:list");
  if (limited) return limited;

  const url = new URL(req.url);
  const page = parsePage(url.searchParams.get("page"));
  const pageSize = parsePageSize(url.searchParams.get("pageSize"), 20);

  const where: Prisma.EventWhereInput = { deletedAt: null };
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
    const delegate = prisma.event;
    const result = await paginate(
      () => delegate.count({ where }),
      (skip, take) =>
        delegate.findMany({ where, orderBy: [{ startAt: "desc" }], skip, take }),
      page,
      pageSize
    );
    return jsonPage(result);
  } catch (error) {
    console.error("[api] GET /api/v1/admin/events failed:", error);
    return NextResponse.json(
      { error: "service_unavailable", message: "Could not load events." },
      { status: 503 }
    );
  }
}

/** Create or update an event. */
export async function POST(req: Request) {
  return handleContentWrite({
    req,
    model: "event",
    targetType: "event",
    collection: "events",
    schema: eventSchema,
    titleOf: (r) => String(r.title ?? ""),
    toData: (input) => ({
      title: input.title,
      summary: input.summary,
      description: input.description || null,
      startAt: input.startAt,
      endAt: input.endAt ?? null,
      location: input.location || null,
      organizer: input.organizer || null,
      imageUrl: input.imageUrl || null,
      imageAlt: input.imageAlt || null,
      registrationInfo: input.registrationInfo || null,
    }),
    afterWrite: async (record, input) => {
      if (!record.slug) {
        const slug = await uniqueSlug(prisma.event, input.title);
        await prisma.event.update({ where: { id: String(record.id) }, data: { slug } });
      }
    },
  });
}

export const dynamic = "force-dynamic";
