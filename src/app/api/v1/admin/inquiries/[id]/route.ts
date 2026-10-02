import { NextResponse } from "next/server";
import { prisma } from "@/backend/prisma";
import { requirePermission, adminRateLimit } from "@/backend/admin-guard";
import { firstZodError, inquiryStatusSchema } from "@/shared/validators";
import { publish, publishMeta, recordAudit } from "@/backend/publish";

type Context = { params: Promise<{ id: string }> };

/** Records notes against an inquiry. */
export async function PATCH(req: Request, context: Context) {
  const guard = await requirePermission(req, "editContent");
  if ("response" in guard) return guard.response;
  const user = guard.user;
  const limited = adminRateLimit(req, "inquiries:update");
  if (limited) return limited;

  const { id } = await context.params;

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
      return NextResponse.json(
        { error: "not_found", message: "Inquiry not found." },
        { status: 404 }
      );
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
    return NextResponse.json(
      { error: "service_unavailable", message: "Could not update inquiry." },
      { status: 503 }
    );
  }
}

export const dynamic = "force-dynamic";