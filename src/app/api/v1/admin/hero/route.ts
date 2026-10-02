import { NextResponse } from "next/server";
import { prisma } from "@/backend/prisma";
import { adminRateLimit, requirePermission } from "@/backend/admin-guard";
import { firstZodError, heroSchema } from "@/shared/validators";
import { assertFresh, publish, publishMeta, recordAudit } from "@/backend/publish";

export async function POST(req: Request) {
  const guard = await requirePermission(req, "editContent");
  if ("response" in guard) return guard.response;
  const user = guard.user;
  const limited = adminRateLimit(req, "hero");
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

  const parsed = heroSchema.safeParse(payload);
  if (!parsed.success) {
    const issue = firstZodError(parsed.error);
    return NextResponse.json(
      { error: "validation", field: issue.field, message: issue.message },
      { status: 400 }
    );
  }
  const baseUpdatedAt =
    typeof payload === "object" && payload !== null && "baseUpdatedAt" in payload
      ? String((payload as { baseUpdatedAt: unknown }).baseUpdatedAt)
      : undefined;

  try {
    const existing = await prisma.heroContent.findFirst({
      orderBy: { createdAt: "asc" },
    });

    if (existing) {
      const conflict = await assertFresh("hero", existing.updatedAt, baseUpdatedAt);
      if (conflict) return conflict;
    }

    const hero = existing
      ? await prisma.heroContent.update({
          where: { id: existing.id },
          data: parsed.data,
        })
      : await prisma.heroContent.create({
          data: parsed.data,
        });

    await recordAudit({
      actor: user,
      action: existing ? "UPDATE" : "CREATE",
      targetType: "hero",
      targetId: hero.id,
      summary: `${existing ? "Updated" : "Published"} the home hero section`,
      before: existing,
      after: hero,
    });
    await publish(user, ["hero"]);

    return NextResponse.json({ ...hero, ...publishMeta(user) });
  } catch (error) {
    console.error("[api] POST /api/v1/admin/hero failed:", error);
    return NextResponse.json(
      { error: "service_unavailable", message: "Could not save hero content." },
      { status: 503 }
    );
  }
}

export const dynamic = "force-dynamic";