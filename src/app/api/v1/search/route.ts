import { NextResponse } from "next/server";
import { searchAll } from "@/lib/content";
import { badRequest, serviceUnavailable } from "@/lib/http";
import { MAX_PAGE_SIZE } from "@/lib/paginate";
import { z } from "zod";

/**
 * Site-wide public search across news, projects, events and publications.
 * GET so the search page can link to a shareable, crawlable result URL.
 */
const querySchema = z.object({
  q: z.string().trim().min(2).max(120),
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = querySchema.safeParse(url.searchParams.get("q"));

  if (!parsed.success) {
    return badRequest("Enter at least 2 characters to search.", "q");
  }

  try {
    const limit = Math.min(
      Number.parseInt(url.searchParams.get("limit") ?? "", 10) || 5,
      MAX_PAGE_SIZE
    );
    const results = await searchAll(parsed.data.q, limit);
    return NextResponse.json(
      { query: parsed.data.q, results, count: results.length },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("[api] GET /api/v1/search failed:", error);
    return serviceUnavailable("Search is temporarily unavailable.");
  }
}

export const dynamic = "force-dynamic";
export const revalidate = 0;
