import { NextResponse } from "next/server";
import { prisma } from "@/backend/prisma";
import { apiCatch } from "@/shared/api-error";

export async function GET() {
  try {
    const members = await prisma.leadershipMember.findMany({
      where: { deletedAt: null },
      orderBy: { displayOrder: "asc" },
    });
    return NextResponse.json(members);
  } catch (error) {
    return apiCatch(error, "GET /api/v1/leadership");
  }
}

export const dynamic = "force-dynamic";
export const revalidate = 0;