import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

const KNOWN_DEV_FALLBACK = "kalisizo-dev-secret-change-me-in-production";

function resolveJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret || secret === KNOWN_DEV_FALLBACK) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "JWT_SECRET must be set to a strong, unique random value in production (e.g. `openssl rand -hex 32`)."
      );
    }
    console.warn(
      "[auth] JWT_SECRET is unset or still the known dev fallback. Set JWT_SECRET in .env before deploying. Using the fallback for local dev only."
    );
  }
  return secret || KNOWN_DEV_FALLBACK;
}

const JWT_SECRET = resolveJwtSecret();
const BCRYPT_ROUNDS = 12;

export const USER_ROLES = ["SUPER_ADMIN", "CONTENT_ADMIN", "EDITOR"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export type AuthUser = {
  sub: string;
  email: string;
  name: string;
  role: UserRole;
};

const JWT_OPTIONS = {
  issuer: "kalisizo-coffee",
  audience: "kalisizo-coffee-admin",
  expiresIn: "8h",
} as const;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Validates a plaintext password against the site's password policy.
 * Returns null when acceptable, otherwise a user-facing reason.
 */
export function passwordPolicyError(password: string): string | null {
  if (password.length < 12) return "Password must be at least 12 characters long.";
  if (password.length > 200) return "Password must be 200 characters or fewer.";
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) =>
    re.test(password)
  ).length;
  if (classes < 3) {
    return "Password must include at least three of: lowercase, uppercase, numbers, symbols.";
  }
  return null;
}

export function signToken(user: AuthUser): string {
  return jwt.sign(
    { sub: user.sub, email: user.email, name: user.name, role: user.role },
    JWT_SECRET,
    JWT_OPTIONS
  );
}

export function verifyToken(token: string): AuthUser | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET, {
      issuer: JWT_OPTIONS.issuer,
      audience: JWT_OPTIONS.audience,
    });
    if (typeof payload === "string") return null;
    const { sub, email, name, role } = payload as jwt.JwtPayload;
    if (!sub || !email || !role) return null;
    // Reject tokens minted under the legacy two-role model, and any role value
    // that is not part of the current matrix.
    if (!USER_ROLES.includes(role as UserRole)) return null;
    return { sub, email, name, role: role as UserRole };
  } catch {
    return null;
  }
}

export function getUserFromRequest(req: Request): AuthUser | null {
  const header = req.headers.get("authorization");
  if (!header || !header.startsWith("Bearer ")) return null;
  return verifyToken(header.slice("Bearer ".length).trim());
}
