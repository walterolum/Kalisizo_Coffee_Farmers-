import { NextResponse } from "next/server";
import type { ContentStatus, Prisma } from "@prisma/client";
import { prisma } from "@/backend/prisma";
import { adminRateLimit, requirePermission } from "@/backend/admin-guard";
import { handleContentWrite, includesSoftDeleted } from "@/backend/admin-content";
import { serviceSchemaV2 } from "@/shared/validators";

const LIST_STATUSES = ["DRAFT", "IN_REVIEW", "PUBLISHED", "ARCHIVED"] as const;

/**
 * Programs (stored as `Service`). These already existed as home-page content, so
 * they now run through the same create/update workflow as every other content
 * type instead of a bespoke handler.
 *
 * They also joined the DRAFT -> IN_REVIEW -> PUBLISHED workflow, which is why
 * the CMS needs its own read endpoint. The public `/api/v1/services` route only
 * returns PUBLISHED rows, so an editor reading through it would never see their
 * own drafts, could not tell a draft from a live program, and would watch newly
 * created programs disappear the moment the list refreshed.
 */
export async function GET(req: Request) {
  const guard = await requirePermission(req, "viewCms");
  if ("response" in guard) return guard.response;
  const limited = adminRateLimit(req, "services:list");
  if (limited) return limited;

  const url = new URL(req.url);
  const rawStatus = url.searchParams.get("status");
  let status: ContentStatus | null = null;

  if (rawStatus) {
    const match = LIST_STATUSES.find((s) => s === rawStatus);
    if (!match) {
      return NextResponse.json(
        { error: "validation", message: "Invalid status filter." },
        { status: 400 }
      );
    }
    status = match;
  }

  const where: Prisma.ServiceWhereInput = {
    status: status ?? undefined,
    deletedAt: includesSoftDeleted(status) ? undefined : null,
  };

  try {
    const services = await prisma.service.findMany({
      where,
      orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
    });
    return NextResponse.json(services);
  } catch (error) {
    console.error("[api] GET /api/v1/admin/services failed:", error);
    return NextResponse.json(
      { error: "service_unavailable", message: "Could not load programs." },
      { status: 503 }
    );
  }
}

export async function POST(req: Request) {
  return handleContentWrite({
    req,
    model: "service",
    targetType: "service",
    collection: "services",
    schema: serviceSchemaV2,
    titleOf: (r) => String(r.title ?? ""),
    toData: (input) => ({
      title: input.title,
      tagline: input.tagline,
      summary: input.summary || input.tagline,
      content: input.content || null,
      points: input.points,
      details: input.details,
      icon: input.icon || null,
      accent: input.accent || null,
      ring: input.ring || null,
      imageUrl: input.imageUrl || null,
      imageAlt: input.imageAlt || null,
      category: input.category || null,
      displayOrder: input.displayOrder ?? 0,
    }),
    // No slug handling here: `handleContentWrite` already derives the slug from
    // `input.slug || input.title` on create, because `Service.slug` is a required
    // unique column with no default. `toData` deliberately omits it, so a later
    // edit leaves the slug alone and `/programs/[slug]` stays stable.
  });
}

export const dynamic = "force-dynamic";
