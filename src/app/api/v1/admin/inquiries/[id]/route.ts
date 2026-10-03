import { NextResponse } from "next/server";
import { prisma } from "@/backend/prisma";
import { requirePermission, adminRateLimit } from "@/backend/admin-guard";
import { firstZodError, idParamSchema, inquiryStatusSchema } from "@/shared/validators";
import { publish, publishMeta, recordAudit } from "@/backend/publish";
import { badRequest, notFound, serviceUnavailable } from "@/shared/http";

type Context = { params: Promise<{ id: string }> };

/** Records notes against an inquiry. */
export async function PATCH(req: Request, context: Context) {
  const guard = await requirePermission(req, "editContent");
  if ("response" in guard) return guard.response;
  const user = guard.user;
  const limited = adminRateLimit(req, "inquiries:update");
  if (limited) return limited;

  const { id } = await context.params;
  if (!idParamSchema.safeParse(id).success) return badRequest("Invalid inquiry id.", "id");

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json(
      { error: "validation", field: "body", message: "Request body must be valid JSON." },
      { status: 400 }
    );
  }

  const parsed = inquiryStatusSchema.safeParse(payload);
  if (!parsed.success) {
    const issue = firstZodError(parsed.error);
    return NextResponse.json(
      { error: "validation", field: issue.field, message: issue.message },
      { status: 400 }
    );
  }

  try {
    const existing = await prisma.contactInquiry.findUnique({ where: { id } });
    if (!existing) {
      return notFound("Inquiry not found.");
    }
    const updated = await prisma.contactInquiry.update({
      where: { id },
      data: { status: parsed.data.status },
    });
    await recordAudit({
      actor: user,
      action: "STATUS_CHANGE",
      targetType: "inquiry",
      targetId: id,
      summary: `Marked inquiry from ${existing.fullName} as ${parsed.data.status}`,
      before: existing,
      after: updated,
    });
    publish(user, ["inquiries"]);
    return NextResponse.json({ ...updated, ...publishMeta(user) });
  } catch (error) {
    console.error(`[api] PATCH /api/v1/admin/inquiries/${id} failed:`, error);
    return serviceUnavailable("Could not update inquiry.");
  }
}

/** Permanently deletes a contact inquiry/message. */
export async function DELETE(req: Request, context: Context) {
  const guard = await requirePermission(req, "deleteMessages");
  if ("response" in guard) return guard.response;
  const user = guard.user;
  const limited = adminRateLimit(req, "inquiries:delete", 20, 60 * 60_000);
  if (limited) return limited;

  const { id } = await context.params;
  if (!idParamSchema.safeParse(id).success) return badRequest("Invalid inquiry id.", "id");

  try {
    const existing = await prisma.contactInquiry.findUnique({
      where: { id },
      select: { id: true, fullName: true, email: true, subject: true },
    });
    if (!existing) {
      return notFound("Inquiry not found.");
    }

    await prisma.contactInquiry.delete({ where: { id } });

    await recordAudit({
      actor: user,
      action: "DELETE",
      targetType: "inquiry",
      targetId: id,
      summary: `Deleted inquiry from ${existing.fullName} (${existing.email})${existing.subject ? ` — ${existing.subject}` : ""}`,
      before: existing,
    });
    publish(user, ["inquiries"]);

    return NextResponse.json({ ok: true, deletedId: id });
  } catch (error) {
    console.error(`[api] DELETE /api/v1/admin/inquiries/${id} failed:`, error);
    return serviceUnavailable("Could not delete the inquiry.");
  }
}

export const dynamic = "force-dynamic";
