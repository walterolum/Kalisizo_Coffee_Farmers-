import { NextResponse } from "next/server";
import { prisma } from "@/backend/prisma";
import { adminRateLimit, requirePermission } from "@/backend/admin-guard";
import { inquiryStatusQuery } from "@/shared/validators";

export async function GET(req: Request) {
  const guard = await requirePermission(req, "viewCms");
  if ("response" in guard) return guard.response;
  const limited = adminRateLimit(req, "inquiries:list");
  if (limited) return limited;

  try {
    const url = new URL(req.url);
    const rawStatus = url.searchParams.get("status");
    let where = {};
    if (rawStatus) {
      const parsed = inquiryStatusQuery.safeParse(rawStatus);
      if (!parsed.success) {
        return NextResponse.json(
          {
            error: "validation",
            message: "Invalid status. Use PENDING, REVIEWED or RESOLVED.",
          },
          { status: 400 }
        );
      }
      where = { status: parsed.data };
    }

    const inquiries = await prisma.contactInquiry.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(inquiries);
  } catch (error) {
    console.error("[api] GET /api/v1/admin/inquiries failed:", error);
    return NextResponse.json(
      { error: "service_unavailable", message: "Could not load inquiries." },
      { status: 503 }
    );
  }
}

export const dynamic = "force-dynamic";