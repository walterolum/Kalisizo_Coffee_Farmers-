import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/backend/prisma";
import { apiCatch } from "@/shared/api-error";
import { productCategoryQuery } from "@/shared/validators";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const rawCategory = url.searchParams.get("category");
    const where: Prisma.ProductWhereInput = {
      isAvailable: true,
      // Unavailable or soft-deleted products are not visible to visitors.
      deletedAt: null,
    };

    if (rawCategory) {
      const parsed = productCategoryQuery.safeParse(rawCategory);
      if (!parsed.success) {
        return NextResponse.json(
          {
            error: "validation",
            message:
              "Invalid category. Use COFFEE_BEANS, FERTILIZER_INPUTS, EQUIPMENT or SACCO_PRODUCT.",
          },
          { status: 400 }
        );
      }
      where.category = parsed.data;
    }

    const products = await prisma.product.findMany({
      where,
      orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
    });

    return NextResponse.json(products);
  } catch (error) {
    return apiCatch(error, "GET /api/v1/products");
  }
}

export const dynamic = "force-dynamic";
export const revalidate = 0;