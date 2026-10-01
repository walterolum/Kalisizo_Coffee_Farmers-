import { requirePermission } from "@/lib/admin-guard";
import { idParamSchema } from "@/lib/validators";
import { handleContentDelete, handleContentRestore } from "@/lib/admin-content";
import { badRequest } from "@/lib/http";

type Context = { params: Promise<{ id: string }> };

/** Archives an FAQ item instead of destroying it, so mistakes are recoverable. */
export async function DELETE(req: Request, context: Context) {
  const { id } = await context.params;
  if (!idParamSchema.safeParse(id).success) {
    return badRequest("Invalid FAQ id.", "id");
  }
  return handleContentDelete(req, id, "faqItem", "faq", "faqs", "question");
}

/** Restores an archived FAQ item. */
export async function PATCH(req: Request, context: Context) {
  const guard = await requirePermission(req, "manageSystem");
  if ("response" in guard) return guard.response;

  const { id } = await context.params;
  if (!idParamSchema.safeParse(id).success) {
    return badRequest("Invalid FAQ id.", "id");
  }
  return handleContentRestore(req, id, "faqItem", "faq", "faqs", "question");
}

export const dynamic = "force-dynamic";
