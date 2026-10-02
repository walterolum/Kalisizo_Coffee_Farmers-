import { NextResponse } from "next/server";
import { prisma } from "@/backend/prisma";

/**
 * Liveness and readiness probe.
 *
 * Used by the container healthcheck and by any external uptime monitor. Reports
 * the database connection state separately from the app's own health, because
 * "the process is up but cannot reach Postgres" needs a different fix from "the
 * process crashed", and a single boolean hides that distinction.
 *
 * Public and unauthenticated by design: an uptime monitor has no session, and
 * the response exposes only connectivity state, never data.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const startedAt = Date.now();

  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json(
      { status: "ok", database: "connected", latencyMs: Date.now() - startedAt },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    // Logged, never returned: a driver message can carry the hostname and
    // database name, which are not something an unauthenticated caller should
    // receive.
    console.error("[api] GET /api/v1/health: database unreachable:", error);
    return NextResponse.json(
      { status: "degraded", database: "unreachable" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}