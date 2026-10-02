import { prisma } from "@/backend/prisma";
import { requirePermission } from "@/backend/admin-guard";
import { idParamSchema } from "@/shared/validators";
import { handleContentDelete, handleContentRestore } from "@/backend/admin-content";
import { badRequest } from "@/shared/http";
import { NextResponse } from "next/server";

type Context = { params: Promise<{ id: string }> };

/** Archives a program. Soft-deleted so it can be restored, never destroyed. */
export async function DELETE(req: Request, context: Context) {
  // Authorize before touching the database. `handleContentDelete` re-checks
  // this, but the guard has to come first here or the count below would run for
  // anonymous callers and leak the record count through its 409 response.
  const guard = await requirePermission(req, "deleteContent");
  if ("response" in guard) return guard.response;

  const { id } = await context.params;
  if (!idParamSchema.safeParse(id).success) {
    return badRequest("Invalid service id.", "id");
  }

  // The home page is built from services, so the cooperative must always have
  // at least one live program to render.
  const live = await prisma.service.count({ where: { deletedAt: null } });
  if (live <= 1) {
    return NextResponse.json(
      { error: "conflict", message: "At least one program must remain published." },
      { status: 409 }
    );
  }

  return handleContentDelete(req, id, "service", "service", "services");
}

/** Restores an archived program, returning it to Draft for review. */
export async function PATCH(req: Request, context: Context) {
  const guard = await requirePermission(req, "manageSystem");
  if ("response" in guard) return guard.response;

  const { id } = await context.params;
  if (!idParamSchema.safeParse(id).success) {
    return badRequest("Invalid service id.", "id");
  }
  return handleContentRestore(req, id, "service", "service", "services");
}

export const dynamic = "force-dynamic";
