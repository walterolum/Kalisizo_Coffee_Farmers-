import { requirePermission } from "@/lib/admin-guard";
import { idParamSchema } from "@/lib/validators";
import { handleContentDelete, handleContentRestore } from "@/lib/admin-content";
import { badRequest } from "@/lib/http";

type Context = { params: Promise<{ id: string }> };

/** Archives a success story instead of destroying it. */
export async function DELETE(req: Request, context: Context) {
  const { id } = await context.params;
  if (!idParamSchema.safeParse(id).success) {
    return badRequest("Invalid success story id.", "id");
  }
  return handleContentDelete(req, id, "successStory", "story", "stories");
}

/** Restores an archived success story. */
export async function PATCH(req: Request, context: Context) {
  const guard = await requirePermission(req, "manageSystem");
  if ("response" in guard) return guard.response;

  const { id } = await context.params;
  if (!idParamSchema.safeParse(id).success) {
    return badRequest("Invalid success story id.", "id");
  }
  return handleContentRestore(req, id, "successStory", "story", "stories");
}

export const dynamic = "force-dynamic";
