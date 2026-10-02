import { NextResponse } from "next/server";
import { prisma } from "@/backend/prisma";
import { apiCatch } from "@/shared/api-error";

export async function GET() {
  try {
    const stories = await prisma.successStory.findMany({
      where: { deletedAt: null },
      orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
    });

    return NextResponse.json(stories);
  } catch (error) {
    return apiCatch(error, "GET /api/v1/stories");
  }
}

export const dynamic = "force-dynamic";
export const revalidate = 0;