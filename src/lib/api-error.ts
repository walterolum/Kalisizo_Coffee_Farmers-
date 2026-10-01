import { NextResponse } from "next/server";

export function apiCatch(error: unknown, context: string): NextResponse {
  console.error(`[api] ${context} failed:`, error);
  return NextResponse.json(
    {
      error: "service_unavailable",
      message:
        "The database is temporarily unavailable. Please try again shortly.",
    },
    { status: 503 }
  );
}