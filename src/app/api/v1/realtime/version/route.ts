import { NextResponse } from "next/server";
import { getRealtimeVersion } from "@/lib/realtime-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  return NextResponse.json(
    { version: getRealtimeVersion(), at: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } }
  );
}
