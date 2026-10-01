import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { adminRateLimit, requirePermission } from "@/lib/admin-guard";
import { contentStatusQuery, publicationSchema } from "@/lib/validators";
import { handleContentWrite, includesSoftDeleted } from "@/lib/admin-content";
import { uniqueSlug } from "@/lib/slug";
import { parsePage, parsePageSize, paginate, jsonPage } from "@/lib/paginate";

/** CMS publication list, including drafts. */
export async function GET(req: Request) {
  const guard = await requirePermission(req, "viewCms");
  if ("response" in guard) return guard.response;
  const limited = adminRateLimit(req, "publications:list");
  if (limited) return limited;

  const url = new URL(req.url);
  const page = parsePage(url.searchParams.get("page"));
  const pageSize = parsePageSize(url.searchParams.get("pageSize"), 20);

  const where: Prisma.PublicationWhereInput = { deletedAt: null };
  const rawStatus = url.searchParams.get("status");
  if (rawStatus) {
    const parsed = contentStatusQuery.safeParse(rawStatus);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "validation", message: "Invalid status filter." },
        { status: 400 }
      );
    }
    where.status = parsed.data;
    if (includesSoftDeleted(parsed.data)) delete where.deletedAt;
  }

  try {
    const delegate = prisma.publication;
    const result = await paginate(
      () => delegate.count({ where }),
      (skip, take) =>
        delegate.findMany({ where, orderBy: [{ updatedAt: "desc" }], skip, take }),
      page,
      pageSize
    );
    return jsonPage(result);
  } catch (error) {
    console.error("[api] GET /api/v1/admin/publications failed:", error);
    return NextResponse.json(
      { error: "service_unavailable", message: "Could not load publications." },
      { status: 503 }
    );
  }
}

/** Create or update a downloadable document. */
export async function POST(req: Request) {
  return handleContentWrite({
    req,
    model: "publication",
    targetType: "publication",
    collection: "publications",
    schema: publicationSchema,
    titleOf: (r) => String(r.title ?? ""),
    toData: (input) => ({
      title: input.title,
      summary: input.summary || null,
      fileUrl: input.fileUrl,
      fileName: input.fileName,
      fileSizeBytes: input.fileSizeBytes,
      mimeType: input.mimeType,
      kind: input.kind ?? "OTHER",
    }),
    afterWrite: async (record, input) => {
      if (!record.slug) {
        const slug = await uniqueSlug(prisma.publication, input.title);
        await prisma.publication.update({
          where: { id: String(record.id) },
          data: { slug },
        });
      }
    },
  });
}

export const dynamic = "force-dynamic";
