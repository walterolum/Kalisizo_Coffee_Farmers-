import { NextResponse } from "next/server";
import { prisma } from "@/backend/prisma";
import { adminRateLimit, requirePermission } from "@/backend/admin-guard";
import { firstZodError, leadershipSchema } from "@/shared/validators";
import { assertFresh, publish, publishMeta, recordAudit } from "@/backend/publish";

export async function POST(req: Request) {
  const guard = await requirePermission(req, "editContent");
  if ("response" in guard) return guard.response;
  const user = guard.user;
  const limited = adminRateLimit(req, "leadership");
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

  const parsed = leadershipSchema.safeParse(payload);
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
      const existing = await prisma.leadershipMember.findUnique({ where: { id } });
      if (!existing) {
        return NextResponse.json(
          { error: "not_found", message: "Leadership member not found." },
          { status: 404 }
        );
      }
      const conflict = await assertFresh("leadership", existing.updatedAt, baseUpdatedAt);
      if (conflict) return conflict;
      const updated = await prisma.leadershipMember.update({
        where: { id },
        data,
      });
      await recordAudit({
        actor: user,
        action: "UPDATE",
        targetType: "leadership",
        targetId: id,
        summary: `Updated leadership member "${updated.name}"`,
        before: existing,
        after: updated,
      });
      await publish(user, ["leadership"]);
      return NextResponse.json({ ...updated, ...publishMeta(user) });
    }

    const created = await prisma.leadershipMember.create({ data });
    await recordAudit({
      actor: user,
      action: "CREATE",
      targetType: "leadership",
      targetId: created.id,
      summary: `Published leadership member "${created.name}"`,
      after: created,
    });
    await publish(user, ["leadership"]);
      return NextResponse.json({ ...created, ...publishMeta(user) }, { status: 201 });
  } catch (error) {
    console.error("[api] POST /api/v1/admin/leadership failed:", error);
    return NextResponse.json(
      { error: "service_unavailable", message: "Could not save leadership member." },
      { status: 503 }
    );
  }
}

export const dynamic = "force-dynamic";