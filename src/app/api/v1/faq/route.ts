import { NextResponse } from "next/server";
import { prisma } from "@/backend/prisma";
import { apiCatch } from "@/shared/api-error";

export async function GET() {
  try {
    const faqs = await prisma.faqItem.findMany({
      where: { deletedAt: null },
      orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
    });

    return NextResponse.json(faqs);
  } catch (error) {
    return apiCatch(error, "GET /api/v1/faq");
  }
}

export const dynamic = "force-dynamic";
export const revalidate = 0;