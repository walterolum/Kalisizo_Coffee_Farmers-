import { NextResponse } from "next/server";
import { getUserFromRequest, type AuthUser, type UserRole } from "@/backend/auth";
import { clientIp, rateLimit } from "@/backend/rate-limit";
import { PERMISSIONS, type Permission } from "@/shared/permissions";

/**
 * Central permission matrix for the CMS.
 *
 * Role model:
 *   SUPER_ADMIN   — full control, including CMS user management and settings.
 *   CONTENT_ADMIN — manages every content type and settings, but cannot manage
 *                   users or perform destructive actions.
 *   EDITOR        — drafts and edits content, cannot publish, delete or manage
 *                   users or settings.
 *
 * The matrix itself lives in `@/shared/permissions` so the admin UI can read it
 * without importing `next/server`. `can(user, action)` is the only place a role
 * check is evaluated; API routes call it and never re-implement it inline.
 */
export { PERMISSIONS };
export type { Permission };

export function can(user: AuthUser | null, permission: Permission): boolean {
  if (!user) return false;
  return (PERMISSIONS[permission] as readonly UserRole[]).includes(user.role);
}

export type GuardFailure = { response: NextResponse } | { user: AuthUser };

/**
 * In-memory rate limit for admin endpoints (defense in depth on top of the
 * bearer token). Keeps a per-IP budget per scope so a leaked token or a
 * mis-behaving client cannot blast the API or disk.
 */
export function adminRateLimit(
  req: Request,
  scope: string,
  limit = 120,
  windowMs = 15 * 60_000
): NextResponse | null {
  const ip = clientIp(req);
  const result = rateLimit(`admin:${scope}:${ip}`, limit, windowMs);
  if (!result.ok) {
    return NextResponse.json(
      { error: "rate_limited", message: "Too many requests. Please wait and retry." },
      { status: 429, headers: { "Retry-After": String(result.retryAfterSeconds) } }
    );
  }
  return null;
}

/**
 * Requires a valid, active CMS session. Deactivated and deleted accounts are
 * rejected even if their JWT is still within its lifetime, so disabling a user
 * takes effect immediately rather than at token expiry.
 */
export async function requireUser(req: Request): Promise<GuardFailure> {
  const user = getUserFromRequest(req);
  if (!user) {
    return {
      response: NextResponse.json(
        { error: "unauthorized", message: "Authentication required." },
        { status: 401 }
      ),
    };
  }

  // Lazily imported so this module stays usable in unit tests without a database.
  const { prisma } = await import("@/backend/prisma");
  try {
    const account = await prisma.user.findUnique({
      where: { id: user.sub },
      select: { isActive: true, role: true },
    });
    if (!account || !account.isActive) {
      return {
        response: NextResponse.json(
          {
            error: "unauthorized",
            message: "This account is no longer active. Contact an administrator.",
          },
          { status: 401 }
        ),
      };
    }
    // The database is authoritative: a role change takes effect on the next
    // request rather than waiting for the token to expire.
    if (account.role !== user.role) user.role = account.role;
  } catch (error) {
    console.error("[auth] could not verify account state:", error);
    return {
      response: NextResponse.json(
        {
          error: "service_unavailable",
          message: "Could not verify your session. Please try again shortly.",
        },
        { status: 503 }
      ),
    };
  }

  return { user };
}

/** Requires an authenticated user holding `permission`. */
export async function requirePermission(
  req: Request,
  permission: Permission
): Promise<GuardFailure> {
  const guard = await requireUser(req);
  if ("response" in guard) return guard;
  if (!can(guard.user, permission)) {
    return {
      response: NextResponse.json(
        {
          error: "forbidden",
          message: `Your role (${roleLabel(guard.user.role)}) cannot ${permissionVerb(permission)}.`,
        },
        { status: 403 }
      ),
    };
  }
  return guard;
}

export function roleLabel(role: UserRole): string {
  switch (role) {
    case "SUPER_ADMIN":
      return "Super Administrator";
    case "CONTENT_ADMIN":
      return "Content Administrator";
    case "EDITOR":
      return "Editor";
  }
}

/** Short, non-technical explanation shown in the CMS so staff understand a refusal. */
function permissionVerb(permission: Permission): string {
  switch (permission) {
    case "viewCms":
      return "view this area";
    case "editContent":
      return "edit content";
    case "publishContent":
      return "publish or unpublish content";
    case "deleteContent":
      return "delete or archive content";
    case "deleteMessages":
      // Named precisely, because the action is: a refusal that says "cannot
      // access system settings" when the button was labelled "Delete message"
      // tells the user nothing about what to do next.
      return "delete contact messages";
    case "manageSettings":
      return "change site settings";
    case "manageMedia":
      return "upload media";
    case "manageUsers":
      return "manage user accounts";
    case "manageSystem":
      return "access system settings";
  }
}
