import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/backend/prisma";
import { adminRateLimit, requirePermission } from "@/backend/admin-guard";
import { contentStatusQuery, newsArticleSchema } from "@/shared/validators";
import { handleContentWrite, includesSoftDeleted } from "@/backend/admin-content";
import { syncArticleTags } from "@/backend/content";
import { uniqueSlug } from "@/shared/slug";
import { parsePage, parsePageSize, paginate, jsonPage } from "@/shared/paginate";

/** CMS news list — includes drafts so editors can see unpublished work. */
export async function GET(req: Request) {
  const guard = await requirePermission(req, "viewCms");
  if ("response" in guard) return guard.response;
  const limited = adminRateLimit(req, "news:list");
  if (limited) return limited;

  const url = new URL(req.url);
  const page = parsePage(url.searchParams.get("page"));
  const pageSize = parsePageSize(url.searchParams.get("pageSize"), 20);
  const search = url.searchParams.get("q")?.trim().slice(0, 120);

  const where: Prisma.NewsArticleWhereInput = { deletedAt: null };
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
  if (search) {
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { excerpt: { contains: search, mode: "insensitive" } },
    ];
  }

  try {
    const delegate = prisma.newsArticle;
    const result = await paginate(
      () => delegate.count({ where }),
      (skip, take) =>
        delegate.findMany({
          where,
          orderBy: [{ updatedAt: "desc" }],
          skip,
          take,
          include: {
            author: { select: { id: true, name: true } },
            category: { select: { id: true, name: true, slug: true } },
            _count: { select: { tags: true } },
          },
        }),
      page,
      pageSize
    );
    return jsonPage(result);
  } catch (error) {
    console.error("[api] GET /api/v1/admin/news failed:", error);
    return NextResponse.json(
      { error: "service_unavailable", message: "Could not load articles." },
      { status: 503 }
    );
  }
}

/** Create or update an article, with tag syncing and slug management. */
export async function POST(req: Request) {
  return handleContentWrite({
    req,
    model: "newsArticle",
    targetType: "news",
    collection: "news",
    schema: newsArticleSchema,
    titleOf: (r) => String(r.title ?? ""),
    toData: (input) => ({
      title: input.title,
      excerpt: input.excerpt,
      content: input.content,
      featuredImageUrl: input.featuredImageUrl || null,
      imageAlt: input.imageAlt || null,
      isFeatured: input.isFeatured ?? false,
      authorId: input.authorId || null,
      categoryId: input.categoryId || null,
      seoTitle: input.seoTitle || null,
      seoDescription: input.seoDescription || null,
    }),
    afterWrite: async (record, input) => {
      // The slug is derived once on create and then left alone, so editing an
      // article's title never breaks a URL that has already been shared.
      if (!record.slug) {
        const slug = await uniqueSlug(prisma.newsArticle, String(record.title));
        await prisma.newsArticle.update({
          where: { id: String(record.id) },
          data: { slug },
        });
        record.slug = slug;
      }
      await syncArticleTags(String(record.id), input.tagNames);
    },
  });
}

export const dynamic = "force-dynamic";
