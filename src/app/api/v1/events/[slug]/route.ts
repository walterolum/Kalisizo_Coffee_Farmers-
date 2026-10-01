import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiCatch } from "@/lib/api-error";
import { badRequest } from "@/lib/http";
import { PUBLIC_WHERE } from "@/lib/workflow";

/** A single published event. */
export async function GET(
  _req: Request,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;
  if (!slug || slug.length > 120) return badRequest("Invalid event.", "slug");

  try {
    const event = await prisma.event.findFirst({ where: { slug, ...PUBLIC_WHERE } });

    if (!event) {
      return NextResponse.json(
        { error: "not_found", message: "Event not found." },
        { status: 404 }
      );
    }
    return NextResponse.json(event, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiCatch(error, `GET /api/v1/events/${slug}`);
  }
}

export const dynamic = "force-dynamic";
export const revalidate = 0;
