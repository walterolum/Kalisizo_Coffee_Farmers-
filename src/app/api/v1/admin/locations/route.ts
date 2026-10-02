import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminRateLimit, requirePermission } from "@/lib/admin-guard";
import { firstZodError, locationSchema } from "@/lib/validators";
import { publish, publishMeta, recordAudit } from "@/lib/publish";

export async function POST(req: Request) {
  const guard = await requirePermission(req, "editContent");
  if ("response" in guard) return guard.response;
  const user = guard.user;
  const limited = adminRateLimit(req, "locations");
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

  const parsed = locationSchema.safeParse(payload);
  if (!parsed.success) {
    const issue = firstZodError(parsed.error);
    return NextResponse.json(
      { error: "validation", field: issue.field, message: issue.message },
      { status: 400 }
    );
  }

  const { id, isMainBranch, ...data } = parsed.data;

  try {
    if (isMainBranch) {
      await prisma.storeLocation.updateMany({ data: { isMainBranch: false } });
    }

    if (id) {
      const existing = await prisma.storeLocation.findUnique({ where: { id } });
      if (!existing) {
        return NextResponse.json(
          { error: "not_found", message: "Store location not found." },
          { status: 404 }
        );
      }
      const updated = await prisma.storeLocation.update({
        where: { id },
        data: { ...data, isMainBranch: isMainBranch ?? false },
      });
      await recordAudit({
        actor: user,
        action: "UPDATE",
        targetType: "location",
        targetId: id,
        summary: `Updated store location "${updated.name}"`,
        before: existing,
        after: updated,
      });
      await publish(user, ["locations"]);
      return NextResponse.json({ ...updated, ...publishMeta(user) });
    }

    const created = await prisma.storeLocation.create({
      data: { ...data, isMainBranch: isMainBranch ?? false },
    });
    await recordAudit({
      actor: user,
      action: "CREATE",
      targetType: "location",
      targetId: created.id,
      summary: `Published store location "${created.name}"`,
      after: created,
    });
    await publish(user, ["locations"]);
      return NextResponse.json({ ...created, ...publishMeta(user) }, { status: 201 });
  } catch (error) {
    console.error("[api] POST /api/v1/admin/locations failed:", error);
    return NextResponse.json(
      { error: "service_unavailable", message: "Could not save store location." },
      { status: 503 }
    );
  }
}

export const dynamic = "force-dynamic";