import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminRateLimit, requirePermission } from "@/lib/admin-guard";
import { cmsPasswordResetSchema, cmsUserUpdateSchema, idParamSchema } from "@/lib/validators";
import { hashPassword, passwordPolicyError } from "@/lib/auth";
import { badRequest, parseBody, serviceUnavailable } from "@/lib/http";
import { recordAudit } from "@/lib/publish";

type Context = { params: Promise<{ id: string }> };

/** True when the change would leave no active Super Administrator able to sign in. */
async function wouldRemoveLastSuperAdmin(
  targetId: string,
  change: { role?: string; isActive?: boolean }
): Promise<boolean> {
  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { role: true, isActive: true },
  });
  if (!target) return false;

  const losesAccess =
    target.role === "SUPER_ADMIN" &&
    (change.isActive === false || (change.role !== undefined && change.role !== "SUPER_ADMIN"));
  if (!losesAccess) return false;

  const remaining = await prisma.user.count({
    where: { id: { not: targetId }, role: "SUPER_ADMIN", isActive: true },
  });
  return remaining === 0;
}

/** Updates name, role or active state. */
export async function PATCH(req: Request, context: Context) {
  const guard = await requirePermission(req, "manageUsers");
  if ("response" in guard) return guard.response;
  const actor = guard.user;
  const limited = adminRateLimit(req, "users:update", 30, 60 * 60_000);
  if (limited) return limited;

  const { id } = await context.params;
  if (!idParamSchema.safeParse(id).success) return badRequest("Invalid user id.", "id");

  const parsed = await parseBody(req, cmsUserUpdateSchema);
  if (!parsed.ok) return parsed.response;
  const { name, role, isActive } = parsed.data;

  // Guard against an administrator locking themselves — or everyone — out.
  if (id === actor.sub && (isActive === false || (role && role !== "SUPER_ADMIN"))) {
    return NextResponse.json(
      {
        error: "forbidden",
        message: "You cannot remove your own Super Administrator access.",
      },
      { status: 403 }
    );
  }

  try {
    if (await wouldRemoveLastSuperAdmin(id, { role, isActive })) {
      return NextResponse.json(
        {
          error: "conflict",
          message:
            "At least one active Super Administrator must remain, otherwise nobody can manage the CMS.",
        },
        { status: 409 }
      );
    }

    const before = await prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, role: true, isActive: true },
    });
    if (!before) {
      return NextResponse.json(
        { error: "not_found", message: "User account not found." },
        { status: 404 }
      );
    }

    const updated = await prisma.user.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(role !== undefined ? { role } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
      },
      select: { id: true, name: true, email: true, role: true, isActive: true, lastLoginAt: true },
    });

    const changes: string[] = [];
    if (name !== undefined && name !== before.name) changes.push(`name to "${name}"`);
    if (role !== undefined && role !== before.role) changes.push(`role to ${role}`);
    if (isActive !== undefined && isActive !== before.isActive) {
      changes.push(isActive ? "reactivated" : "deactivated");
    }

    await recordAudit({
      actor,
      action: "USER_CHANGE",
      targetType: "user",
      targetId: id,
      summary: changes.length
        ? `Updated ${before.email}: ${changes.join(", ")}`
        : `Reviewed account ${before.email} (no changes)`,
      before,
      after: updated,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error(`[api] PATCH /api/v1/admin/users/${id} failed:`, error);
    return serviceUnavailable("Could not update the account.");
  }
}

/** Sets a new password for an account (admin-initiated reset). */
export async function PUT(req: Request, context: Context) {
  const guard = await requirePermission(req, "manageUsers");
  if ("response" in guard) return guard.response;
  const actor = guard.user;
  const limited = adminRateLimit(req, "users:reset", 10, 60 * 60_000);
  if (limited) return limited;

  const { id } = await context.params;
  if (!idParamSchema.safeParse(id).success) return badRequest("Invalid user id.", "id");

  const parsed = await parseBody(req, cmsPasswordResetSchema);
  if (!parsed.ok) return parsed.response;

  const policyError = passwordPolicyError(parsed.data.password);
  if (policyError) return badRequest(policyError, "password");

  try {
    const target = await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true },
    });
    if (!target) {
      return NextResponse.json(
        { error: "not_found", message: "User account not found." },
        { status: 404 }
      );
    }

    await prisma.user.update({
      where: { id },
      data: { passwordHash: await hashPassword(parsed.data.password) },
    });

    // The password is never stored or logged, so the audit entry records only
    // that a reset happened.
    await recordAudit({
      actor,
      action: "USER_CHANGE",
      targetType: "user",
      targetId: id,
      summary: `Reset the password for ${target.email}`,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(`[api] PUT /api/v1/admin/users/${id} failed:`, error);
    return serviceUnavailable("Could not reset the password.");
  }
}

export const dynamic = "force-dynamic";
