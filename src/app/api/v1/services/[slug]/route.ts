import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiCatch } from "@/lib/api-error";
import { badRequest } from "@/lib/http";
import { PUBLIC_WHERE } from "@/lib/workflow";

/** A single published program, addressed by its slug. */
export async function GET(
  _req: Request,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;
  if (!slug || slug.length > 120) return badRequest("Invalid program.", "slug");

  try {
    const program = await prisma.service.findFirst({ where: { slug, ...PUBLIC_WHERE } });

    if (!program) {
      return NextResponse.json(
        { error: "not_found", message: "Program not found." },
        { status: 404 }
      );
    }
    return NextResponse.json(program, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiCatch(error, `GET /api/v1/services/${slug}`);
  }
}

export const dynamic = "force-dynamic";
export const revalidate = 0;
