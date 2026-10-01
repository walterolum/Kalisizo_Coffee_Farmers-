import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiCatch } from "@/lib/api-error";
import { badRequest } from "@/lib/http";
import { PUBLIC_WHERE } from "@/lib/workflow";

const MAX_VIEWS = 1000;

/**
 * A single published article. Reading also increments the view counter, which
 * is best-effort and never blocks the response.
 */
export async function GET(
  _req: Request,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;
  if (!slug || slug.length > 120) return badRequest("Invalid article.", "slug");

  try {
    const article = await prisma.newsArticle.findFirst({
      where: { slug, ...PUBLIC_WHERE },
      include: {
        author: { select: { id: true, name: true } },
        category: { select: { id: true, name: true, slug: true } },
        tags: { select: { id: true, name: true, slug: true } },
      },
    });

    if (!article) {
      return NextResponse.json(
        { error: "not_found", message: "Article not found." },
        { status: 404 }
      );
    }

    void prisma.newsArticle
      .update({
        where: { id: article.id },
        data: { viewCount: { increment: 1 } },
      })
      .catch(() => undefined);

    const { content, ...rest } = article;
    return NextResponse.json(
      { ...rest, content, viewCount: Math.min(article.viewCount + 1, MAX_VIEWS) },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return apiCatch(error, `GET /api/v1/news/${slug}`);
  }
}

export const dynamic = "force-dynamic";
export const revalidate = 0;
