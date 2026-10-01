import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiCatch } from "@/lib/api-error";
import { PUBLIC_WHERE } from "@/lib/workflow";

export async function GET() {
  try {
    const services = await prisma.service.findMany({
      // Only live programs: unpublished or archived ones must not be exposed.
      where: PUBLIC_WHERE,
      orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
    });

    return NextResponse.json(services);
  } catch (error) {
    return apiCatch(error, "GET /api/v1/services");
  }
}

export const dynamic = "force-dynamic";
export const revalidate = 0;