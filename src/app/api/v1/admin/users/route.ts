import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminRateLimit, requirePermission } from "@/lib/admin-guard";
import { cmsUserCreateSchema } from "@/lib/validators";
import { hashPassword, passwordPolicyError } from "@/lib/auth";
import { badRequest, parseBody, serviceUnavailable } from "@/lib/http";
import { recordAudit } from "@/lib/publish";

/** Lists CMS accounts. Never returns password hashes. */
export async function GET(req: Request) {
  const guard = await requirePermission(req, "manageUsers");
  if ("response" in guard) return guard.response;
  const limited = adminRateLimit(req, "users:list");
  if (limited) return limited;

  try {
    const users = await prisma.user.findMany({
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        _count: { select: { articles: true } },
      },
    });
    return NextResponse.json(
      { items: users, total: users.length },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("[api] GET /api/v1/admin/users failed:", error);
    return serviceUnavailable("Could not load user accounts.");
  }
}

/** Creates a CMS account. */
export async function POST(req: Request) {
  const guard = await requirePermission(req, "manageUsers");
  if ("response" in guard) return guard.response;
  const user = guard.user;
  const limited = adminRateLimit(req, "users:create", 20, 60 * 60_000);
  if (limited) return limited;

  const parsed = await parseBody(req, cmsUserCreateSchema);
  if (!parsed.ok) return parsed.response;

  const { name, email, password, role, isActive } = parsed.data;

  const policyError = passwordPolicyError(password);
  if (policyError) return badRequest(policyError, "password");

  try {
    const created = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash: await hashPassword(password),
        role,
        isActive,
      },
      select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
    });

    await recordAudit({
      actor: user,
      action: "USER_CHANGE",
      targetType: "user",
      targetId: created.id,
      summary: `Created CMS account ${created.email} as ${created.role}`,
      after: created,
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return badRequest("A CMS account already uses that email address.", "email");
    }
    console.error("[api] POST /api/v1/admin/users failed:", error);
    return serviceUnavailable("Could not create the account.");
  }
}

/** Postgres unique-constraint violation (Prisma error code P2002). */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "P2002"
  );
}

export const dynamic = "force-dynamic";
