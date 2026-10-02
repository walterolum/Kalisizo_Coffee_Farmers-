import { NextResponse } from "next/server";
import { broadcastRealtimeUpdate } from "@/backend/realtime-server";
import { getUserFromRequest } from "@/backend/auth";
import { adminRateLimit } from "@/backend/admin-guard";

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
    // Awaited: the Supabase transport is a network call, and on Vercel work still
    // in flight when the response is returned can be frozen. The publish never
    // throws, so this cannot fail the request — it only bounds how long it takes.
    await broadcastRealtimeUpdate({ source: "admin-bump" });
  } catch {
    /* ignore */
  }
  return NextResponse.json(
    { ok: true, at: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } }
  );
}