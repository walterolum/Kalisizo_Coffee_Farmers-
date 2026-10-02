import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { signToken, verifyPassword } from "@/lib/auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { firstZodError, loginSchema } from "@/lib/validators";
import { recordAudit } from "@/lib/publish";

/**
 * A valid bcrypt hash of a value nobody can supply. Comparing against it when
 * the account is unknown keeps the failure path as slow as the success path, so
 * login timing does not disclose which usernames or email addresses are
 * registered.
 */
const DUMMY_HASH = "$2a$12$C6UzMDM.H6dfI/f/IKcEe.7Xr5DdF1O0zvxvB1PJFPJzvxvxvxvxK";

export async function POST(req: Request) {
  const ip = clientIp(req);
  const limit = rateLimit(`admin-login:${ip}`, 10, 15 * 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      {
        error: "rate_limited",
        message: "Too many login attempts. Please wait a few minutes and retry.",
      },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSeconds) },
      }
    );
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json(
      { error: "validation", field: "body", message: "Request body must be valid JSON." },
      { status: 400 }
    );
  }

  const parsed = loginSchema.safeParse(payload);
  if (!parsed.success) {
    const issue = firstZodError(parsed.error);
    return NextResponse.json(
      { error: "validation", field: issue.field, message: issue.message },
      { status: 400 }
    );
  }

  const identifier = parsed.data.identifier;

  let user: Awaited<ReturnType<typeof prisma.user.findFirst>> | null = null;
  try {
    // One round trip for both columns, so a wrong username is not measurably
    // slower than a wrong email. `username` is nullable, which Prisma's `OR`
    // handles correctly: the null row simply never matches a non-null input.
    user = await prisma.user.findFirst({
      where: { OR: [{ username: identifier }, { email: identifier }] },
    });
  } catch (error) {
    // Logged, never returned. A 503 here is the one signal that the database is
    // down, and with this silent a total outage was indistinguishable from a
    // burst of bad passwords: the response was right, the diagnosis was
    // unavailable. The client still only ever sees the generic message below.
    console.error("[login] user lookup failed:", error);
    return NextResponse.json(
      {
        error: "database_unavailable",
        message:
          "The database is temporarily unavailable. Please try again in a moment.",
      },
      { status: 503 }
    );
  }

  // A real hash comparison is always performed, even for an unknown address, so
  // response timing does not reveal whether an account exists.
  const passwordOk = await verifyPassword(
    parsed.data.password,
    user?.passwordHash ?? DUMMY_HASH
  );

  if (!user || !passwordOk) {
    return NextResponse.json(
      { error: "invalid_credentials", message: "Invalid username or password." },
      { status: 401 }
    );
  }

  // Deactivated accounts are refused here as well as on every later request, so
  // disabling a user stops access immediately rather than at token expiry.
  if (!user.isActive) {
    return NextResponse.json(
      {
        error: "account_inactive",
        message:
          "This account has been deactivated. Contact a Super Administrator to restore access.",
      },
      { status: 403 }
    );
  }

  const token = signToken({
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  });

  await recordAudit({
    actor: { sub: user.id, email: user.email, name: user.name, role: user.role },
    action: "LOGIN",
    targetType: "user",
    targetId: user.id,
    summary: `${user.name} signed in`,
  });

  // Best-effort: record the sign-in time without failing the login if it errors.
  try {
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
  } catch (error) {
    console.error("[auth] could not record lastLoginAt:", error);
  }

  return NextResponse.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
}

export const dynamic = "force-dynamic";