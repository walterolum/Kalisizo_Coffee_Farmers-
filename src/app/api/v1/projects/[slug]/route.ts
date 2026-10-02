import { NextResponse } from "next/server";
import { prisma } from "@/backend/prisma";
import { apiCatch } from "@/shared/api-error";
import { badRequest } from "@/shared/http";
import { PUBLIC_WHERE } from "@/shared/workflow";

/** A single published project. */
export async function GET(
  _req: Request,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;
  if (!slug || slug.length > 120) return badRequest("Invalid project.", "slug");

  try {
    const project = await prisma.project.findFirst({
      where: { slug, ...PUBLIC_WHERE },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        images: {
          where: PUBLIC_WHERE,
          orderBy: { displayOrder: "asc" },
          select: { id: true, url: true, thumbnailUrl: true, alt: true, caption: true },
        },
      },
    });

    if (!project) {
      return NextResponse.json(
        { error: "not_found", message: "Project not found." },
        { status: 404 }
      );
    }
    return NextResponse.json(project, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiCatch(error, `GET /api/v1/projects/${slug}`);
  }
}

export const dynamic = "force-dynamic";
export const revalidate = 0;
