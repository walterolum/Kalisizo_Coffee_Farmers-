import { idParamSchema } from "@/shared/validators";
import { handleContentDelete, handleContentRestore } from "@/backend/admin-content";
import { badRequest } from "@/shared/http";

type Context = { params: Promise<{ id: string }> };

export async function DELETE(req: Request, context: Context) {
  const { id } = await context.params;
  if (!idParamSchema.safeParse(id).success) return badRequest("Invalid album id.", "id");
  return handleContentDelete(req, id, "galleryAlbum", "gallery-album", "gallery");
}

export async function PATCH(req: Request, context: Context) {
  const { id } = await context.params;
  if (!idParamSchema.safeParse(id).success) return badRequest("Invalid album id.", "id");
  return handleContentRestore(req, id, "galleryAlbum", "gallery-album", "gallery");
}

export const dynamic = "force-dynamic";
