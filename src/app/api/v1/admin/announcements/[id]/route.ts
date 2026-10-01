import { idParamSchema } from "@/lib/validators";
import { handleContentDelete, handleContentRestore } from "@/lib/admin-content";
import { badRequest } from "@/lib/http";

type Context = { params: Promise<{ id: string }> };

export async function DELETE(req: Request, context: Context) {
  const { id } = await context.params;
  if (!idParamSchema.safeParse(id).success) {
    return badRequest("Invalid announcement id.", "id");
  }
  return handleContentDelete(req, id, "announcement", "announcement", "announcements");
}

export async function PATCH(req: Request, context: Context) {
  const { id } = await context.params;
  if (!idParamSchema.safeParse(id).success) {
    return badRequest("Invalid announcement id.", "id");
  }
  return handleContentRestore(req, id, "announcement", "announcement", "announcements");
}

export const dynamic = "force-dynamic";
