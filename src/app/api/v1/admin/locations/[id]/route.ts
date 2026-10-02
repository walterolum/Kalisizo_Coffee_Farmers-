import { NextResponse } from "next/server";
import { prisma } from "@/backend/prisma";
import { requirePermission } from "@/backend/admin-guard";
import { idParamSchema } from "@/shared/validators";
import { handleContentDelete, handleContentRestore } from "@/backend/admin-content";
import { badRequest } from "@/shared/http";

type Context = { params: Promise<{ id: string }> };

/** Archives a store location instead of destroying it. */
export async function DELETE(req: Request, context: Context) {
  // Authorize before touching the database; see the note in the services route.
  const guard = await requirePermission(req, "deleteContent");
  if ("response" in guard) return guard.response;

  const { id } = await context.params;
  if (!idParamSchema.safeParse(id).success) {
    return badRequest("Invalid location id.", "id");
  }

  // The contact block renders the main branch, so at least one location must
  // always remain.
  const live = await prisma.storeLocation.count({ where: { deletedAt: null } });
  if (live <= 1) {
    return NextResponse.json(
      { error: "conflict", message: "At least one store location must remain." },
      { status: 409 }
    );
  }

  return handleContentDelete(req, id, "storeLocation", "location", "locations", "name");
}

/** Restores an archived store location. */
export async function PATCH(req: Request, context: Context) {
  const guard = await requirePermission(req, "manageSystem");
  if ("response" in guard) return guard.response;

  const { id } = await context.params;
  if (!idParamSchema.safeParse(id).success) {
    return badRequest("Invalid location id.", "id");
  }
  return handleContentRestore(req, id, "storeLocation", "location", "locations", "name");
}

export const dynamic = "force-dynamic";
