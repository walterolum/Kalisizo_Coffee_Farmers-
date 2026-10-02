import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/backend/prisma";
import { adminRateLimit, requirePermission } from "@/backend/admin-guard";
import { contentStatusQuery, pageSchema } from "@/shared/validators";
import { handleContentWrite, includesSoftDeleted } from "@/backend/admin-content";
import { parsePage, parsePageSize, paginate, jsonPage } from "@/shared/paginate";

/** CMS page list, including drafts. */
export async function GET(req: Request) {
  const guard = await requirePermission(req, "viewCms");
  if ("response" in guard) return guard.response;
  const limited = adminRateLimit(req, "pages:list");
  if (limited) return limited;

  const url = new URL(req.url);
  const page = parsePage(url.searchParams.get("page"));
  const pageSize = parsePageSize(url.searchParams.get("pageSize"), 20);

  const where: Prisma.PageWhereInput = { deletedAt: null };
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
    const delegate = prisma.page;
    const result = await paginate(
      () => delegate.count({ where }),
      (skip, take) =>
        delegate.findMany({
          where,
          orderBy: [{ displayOrder: "asc" }, { title: "asc" }],
          skip,
          take,
          select: {
            id: true, title: true, slug: true, status: true,
            showInFooter: true, displayOrder: true, updatedAt: true,
          },
        }),
      page,
      pageSize
    );
    return jsonPage(result);
  } catch (error) {
    console.error("[api] GET /api/v1/admin/pages failed:", error);
    return NextResponse.json(
      { error: "service_unavailable", message: "Could not load pages." },
      { status: 503 }
    );
  }
}

/** Create or update a content page. */
export async function POST(req: Request) {
  return handleContentWrite({
    req,
    model: "page",
    targetType: "page",
    collection: "pages",
    schema: pageSchema,
    titleOf: (r) => String(r.title ?? ""),
    toData: (input) => ({
      title: input.title,
      excerpt: input.excerpt || null,
      content: input.content,
      imageUrl: input.imageUrl || null,
      imageAlt: input.imageAlt || null,
      showInFooter: input.showInFooter ?? false,
      displayOrder: input.displayOrder ?? 0,
      seoTitle: input.seoTitle || null,
      seoDescription: input.seoDescription || null,
    }),
    // No slug handling here: `handleContentWrite` derives the slug from
    // `input.slug || input.title` on create, since `Page.slug` is required and
    // unique. `toData` omits it, so an edit never moves an existing page URL.
  });
}

export const dynamic = "force-dynamic";
