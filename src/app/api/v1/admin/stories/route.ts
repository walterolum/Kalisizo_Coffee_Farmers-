import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminRateLimit, requirePermission } from "@/lib/admin-guard";
import { firstZodError, successStorySchema } from "@/lib/validators";
import { assertFresh, publish, publishMeta, recordAudit } from "@/lib/publish";

export async function POST(req: Request) {
  const guard = await requirePermission(req, "editContent");
  if ("response" in guard) return guard.response;
  const user = guard.user;
  const limited = adminRateLimit(req, "stories");
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

  const parsed = successStorySchema.safeParse(payload);
  if (!parsed.success) {
    const issue = firstZodError(parsed.error);
    return NextResponse.json(
      { error: "validation", field: issue.field, message: issue.message },
      { status: 400 }
    );
  }

  const { id, ...data } = parsed.data;
  const baseUpdatedAt =
    typeof payload === "object" && payload !== null && "baseUpdatedAt" in payload
      ? String((payload as { baseUpdatedAt: unknown }).baseUpdatedAt)
      : undefined;

  try {
    if (id) {
      const existing = await prisma.successStory.findUnique({ where: { id } });
      if (!existing) {
        return NextResponse.json(
          { error: "not_found", message: "Success story not found." },
          { status: 404 }
        );
      }
      const conflict = await assertFresh("story", existing.updatedAt, baseUpdatedAt);
      if (conflict) return conflict;
      const updated = await prisma.successStory.update({ where: { id }, data });
      await recordAudit({
        actor: user,
        action: "UPDATE",
        targetType: "story",
        targetId: id,
        summary: `Updated success story "${updated.title}"`,
        before: existing,
        after: updated,
      });
      await publish(user, ["stories"]);
      return NextResponse.json({ ...updated, ...publishMeta(user) });
    }

    const created = await prisma.successStory.create({ data });
    await recordAudit({
      actor: user,
      action: "CREATE",
      targetType: "story",
      targetId: created.id,
      summary: `Published success story "${created.title}"`,
      after: created,
    });
    await publish(user, ["stories"]);
      return NextResponse.json({ ...created, ...publishMeta(user) }, { status: 201 });
  } catch (error) {
    console.error("[api] POST /api/v1/admin/stories failed:", error);
    return NextResponse.json(
      { error: "service_unavailable", message: "Could not save success story." },
      { status: 503 }
    );
  }
}

export const dynamic = "force-dynamic";