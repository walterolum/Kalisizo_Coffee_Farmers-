import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { adminRateLimit, requirePermission } from "@/lib/admin-guard";
import { announcementSchema, contentStatusQuery } from "@/lib/validators";
import { handleContentWrite, includesSoftDeleted } from "@/lib/admin-content";
import { uniqueSlug } from "@/lib/slug";
import { parsePage, parsePageSize, paginate, jsonPage } from "@/lib/paginate";

/** CMS announcement list, including drafts and expired notices. */
export async function GET(req: Request) {
  const guard = await requirePermission(req, "viewCms");
  if ("response" in guard) return guard.response;
  const limited = adminRateLimit(req, "announcements:list");
  if (limited) return limited;

  const url = new URL(req.url);
  const page = parsePage(url.searchParams.get("page"));
  const pageSize = parsePageSize(url.searchParams.get("pageSize"), 20);

  const where: Prisma.AnnouncementWhereInput = { deletedAt: null };
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
    console.error("[api] GET /api/v1/admin/announcements failed:", error);
    return NextResponse.json(
      { error: "service_unavailable", message: "Could not load announcements." },
      { status: 503 }
    );
  }
}

/** Create or update an announcement. */
export async function POST(req: Request) {
  return handleContentWrite({
    req,
    model: "announcement",
    targetType: "announcement",
    collection: "announcements",
    schema: announcementSchema,
    titleOf: (r) => String(r.title ?? ""),
    toData: (input) => ({
      title: input.title,
      body: input.body,
      severity: input.severity ?? "INFO",
      startsAt: input.startsAt ?? null,
      endsAt: input.endsAt ?? null,
      linkUrl: input.linkUrl || null,
      linkLabel: input.linkLabel || null,
      isPinned: input.isPinned ?? false,
    }),
    afterWrite: async (record, input) => {
      if (!record.slug) {
        const slug = await uniqueSlug(prisma.announcement, input.title);
        await prisma.announcement.update({
          where: { id: String(record.id) },
          data: { slug },
        });
      }
    },
  });
}

export const dynamic = "force-dynamic";
