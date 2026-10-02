import { idParamSchema } from "@/shared/validators";
import { handleContentDelete, handleContentRestore } from "@/backend/admin-content";
import { badRequest } from "@/shared/http";

type Context = { params: Promise<{ id: string }> };

/** Archives an article. Content is soft-deleted so it can be restored later. */
export async function DELETE(req: Request, context: Context) {
  const { id } = await context.params;
  if (!idParamSchema.safeParse(id).success) return badRequest("Invalid article id.", "id");
  return handleContentDelete(req, id, "newsArticle", "news", "news");
}

/** Restores a previously archived article, returning it to Draft for review. */
export async function PATCH(req: Request, context: Context) {
  const { id } = await context.params;
  if (!idParamSchema.safeParse(id).success) return badRequest("Invalid article id.", "id");
  return handleContentRestore(req, id, "newsArticle", "news", "news");
}

export const dynamic = "force-dynamic";
