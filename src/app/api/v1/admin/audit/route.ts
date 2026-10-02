import { NextResponse } from "next/server";
import { prisma } from "@/backend/prisma";
import { adminRateLimit, requirePermission } from "@/backend/admin-guard";

export const dynamic = "force-dynamic";

// Recent CMS activity for the admin feed: who changed what, when, and with what outcome.
// Restricted to Super Administrators because the trail records who touched what,
// including account and permission changes.
export async function GET(req: Request) {
  const guard = await requirePermission(req, "manageSystem");
  if ("response" in guard) return guard.response;
  const limited = adminRateLimit(req, "audit", 240);
  if (limited) return limited;

  try {
    const url = new URL(req.url);
    const limitRaw = url.searchParams.get("limit");
    const limit = Math.min(Number(limitRaw) || 25, 100);

    const entries = await prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return NextResponse.json(entries, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[api] GET /api/v1/admin/audit failed:", error);
    return NextResponse.json(
      { error: "service_unavailable", message: "Could not load activity log." },
      { status: 503 }
    );
  }
}