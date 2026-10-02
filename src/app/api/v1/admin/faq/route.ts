import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminRateLimit, requirePermission } from "@/lib/admin-guard";
import { firstZodError, faqItemSchema } from "@/lib/validators";
import { publish, publishMeta, recordAudit } from "@/lib/publish";

export async function POST(req: Request) {
  const guard = await requirePermission(req, "editContent");
  if ("response" in guard) return guard.response;
  const user = guard.user;
  const limited = adminRateLimit(req, "faq");
  if (limited) return limited;

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json(
      { error: "validation", field: "body", message: "Request body must be valid JSON." },
      { status: 400 }
    );
  }

  const parsed = faqItemSchema.safeParse(payload);
  if (!parsed.success) {
    const issue = firstZodError(parsed.error);
    return NextResponse.json(
      { error: "validation", field: issue.field, message: issue.message },
      { status: 400 }
    );
  }

  const { id, ...data } = parsed.data;

  try {
    if (id) {
      const existing = await prisma.faqItem.findUnique({ where: { id } });
      if (!existing) {
        return NextResponse.json(
          { error: "not_found", message: "FAQ item not found." },
          { status: 404 }
        );
      }
      const updated = await prisma.faqItem.update({ where: { id }, data });
      await recordAudit({
        actor: user,
        action: "UPDATE",
        targetType: "faq",
        targetId: id,
        summary: `Updated FAQ "${updated.question}"`,
        before: existing,
        after: updated,
      });
      await publish(user, ["faq"]);
      return NextResponse.json({ ...updated, ...publishMeta(user) });
    }

    const created = await prisma.faqItem.create({ data });
    await recordAudit({
      actor: user,
      action: "CREATE",
      targetType: "faq",
      targetId: created.id,
      summary: `Published FAQ "${created.question}"`,
      after: created,
    });
    await publish(user, ["faq"]);
      return NextResponse.json({ ...created, ...publishMeta(user) }, { status: 201 });
  } catch (error) {
    console.error("[api] POST /api/v1/admin/faq failed:", error);
    return NextResponse.json(
      { error: "service_unavailable", message: "Could not save FAQ item." },
      { status: 503 }
    );
  }
}

export const dynamic = "force-dynamic";