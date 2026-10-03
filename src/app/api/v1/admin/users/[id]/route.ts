import { NextResponse } from "next/server";
import { prisma } from "@/backend/prisma";
import { adminRateLimit, requirePermission } from "@/backend/admin-guard";
import { cmsPasswordResetSchema, cmsUserUpdateSchema, idParamSchema } from "@/shared/validators";
import { hashPassword, passwordPolicyError } from "@/backend/auth";
import { badRequest, notFound, parseBody, serviceUnavailable } from "@/shared/http";
import { recordAudit } from "@/backend/publish";

type Context = { params: Promise<{ id: string }> };

/**
 * True when the change would leave no active Super Administrator able to sign in.
 *
 * Only `PATCH` calls this now; `DELETE` proves the same invariant structurally
 * instead. See the long note on `DELETE` for why a pre-condition count is the
 * wrong tool for it — read that before adding a call site here.
 */
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

/**
 * Permanently removes a CMS account.
 *
 * Distinct from `PATCH`, which deactivates: deactivation keeps the row and its
 * authored content, so a person's history stays attributed to a real account,
 * and reactivation is one click. This destroys the row, which is why the CMS
 * offers both and why the confirmation dialog names the difference.
 *
 * Two properties hold, and they are structural rather than a checked
 * precondition — see the note on the self-delete refusal below.
 */
export async function DELETE(req: Request, context: Context) {
  const guard = await requirePermission(req, "manageUsers");
  if ("response" in guard) return guard.response;
  const actor = guard.user;
  const limited = adminRateLimit(req, "users:delete", 10, 60 * 60_000);
  if (limited) return limited;

  const { id } = await context.params;
  if (!idParamSchema.safeParse(id).success) return badRequest("Invalid user id.", "id");

  /**
   * The CMS cannot be orphaned by this route, and this is the whole of the
   * argument:
   *
   *   1. `requirePermission(…, "manageUsers")` above means the caller is a Super
   *      Administrator, and `requireUser` inside it has already re-read the row
   *      and confirmed `isActive`. So the caller is, by definition, one active
   *      Super Administrator who survives this request.
   *   2. The caller cannot delete themselves (this check), so the row removed is
   *      never the one that satisfies (1).
   *
   * Therefore at least one active Super Administrator exists before and after.
   *
   * An earlier draft also asked `wouldRemoveLastSuperAdmin` here and returned a
   * 409. It was dead code: by (1) the caller always counts as a remaining
   * Super Administrator, so the count it computed could never be zero. Worse,
   * it looked like it covered the one case that genuinely can orphan the CMS —
   * two Super Administrators deleting each other concurrently, where each
   * request sees the other still present. A pre-condition count does not catch
   * that, so the branch advertised a protection it did not provide. Removing it
   * is why the reasoning is written out above rather than hidden in a helper.
   */
  if (id === actor.sub) {
    return NextResponse.json(
      { error: "forbidden", message: "You cannot delete your own account." },
      { status: 403 }
    );
  }

  try {
    const target = await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, role: true, isActive: true },
    });
    if (!target) {
      return notFound("User account not found.");
    }

    await prisma.user.delete({ where: { id } });

    await recordAudit({
      actor,
      action: "USER_CHANGE",
      targetType: "user",
      targetId: id,
      summary: `Deleted CMS account ${target.email} (${target.role})`,
      before: target,
    });

    return NextResponse.json({ ok: true, deletedId: id });
  } catch (error) {
    console.error(`[api] DELETE /api/v1/admin/users/${id} failed:`, error);
    return serviceUnavailable("Could not delete the account.");
  }
}

export const dynamic = "force-dynamic";
