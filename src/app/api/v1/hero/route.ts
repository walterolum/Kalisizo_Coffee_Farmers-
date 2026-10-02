import { NextResponse } from "next/server";
import { prisma } from "@/backend/prisma";
import { apiCatch } from "@/shared/api-error";

export async function GET() {
  try {
    const hero = await prisma.heroContent.findFirst({
      orderBy: { createdAt: "asc" },
    });

    if (!hero) {
      return NextResponse.json(
        { error: "not_found", message: "Hero content has not been configured." },
        { status: 404 }
      );
    }

    return NextResponse.json(hero);
  } catch (error) {
    return apiCatch(error, "GET /api/v1/hero");
  }
}

export const dynamic = "force-dynamic";
export const revalidate = 0;