import { NextResponse } from "next/server";
import { broadcastRealtimeUpdate } from "@/lib/realtime-server";
import { getUserFromRequest } from "@/lib/auth";
import { adminRateLimit } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Admin-only: used to push a "data changed" signal to all open clients via SSE.
// Must be authenticated and rate limited to avoid anonymous broadcast loops.
export async function POST(req: Request) {
  const user = getUserFromRequest(req);
  if (!user) {
    return NextResponse.json(
      { error: "unauthorized", message: "Authentication required." },
      { status: 401 }
    );
  }
  const limited = adminRateLimit(req, "bump", 60, 60_000);
  if (limited) return limited;

  try {
    broadcastRealtimeUpdate({ source: "admin-bump" });
  } catch {
    /* ignore */
  }
  return NextResponse.json(
    { ok: true, at: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } }
  );
}