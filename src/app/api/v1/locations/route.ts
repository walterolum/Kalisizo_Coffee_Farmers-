import { NextResponse } from "next/server";
import { prisma } from "@/backend/prisma";
import { apiCatch } from "@/shared/api-error";

export async function GET() {
  try {
    const locations = await prisma.storeLocation.findMany({
      where: { deletedAt: null },
      orderBy: [{ isMainBranch: "desc" }, { createdAt: "asc" }],
    });
    return NextResponse.json(locations);
  } catch (error) {
    return apiCatch(error, "GET /api/v1/locations");
  }
}

export const dynamic = "force-dynamic";
export const revalidate = 0;