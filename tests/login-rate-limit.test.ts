import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Behavioural regression test for the login rate limiter.
 *
 * The vulnerability this guards was found by probing a running build, not by
 * reading code: the limiter was keyed only on the reported IP, which comes from
 * `X-Forwarded-For` — a header the caller sets. With a limit of ten, twelve
 * consecutive requests that each carried a *different* header were all
 * processed and none throttled, so password guessing was unbounded.
 *
 * This drives the real route handler with rotating headers and asserts it
 * refuses anyway. Testing `rateLimit` in isolation would not catch the route
 * being wired back to a single evadable bucket, which is the only way this bug
 * could return.
 */

const hash = "$2b$12$C6UzMDM.H6dfI/f/IKcEe.7Xr5DdF1O0zvxvB1PJFPJzvxvxvxvxK";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      // An identifier containing "ghost" stands in for an account that does not
      // exist. Both cases must be indistinguishable to the caller.
      // The route queries `OR: [{ username }, { email }]`, so the first branch
      // carries the identifier under `username`.
      findFirst: vi.fn(
        async ({ where }: { where: { OR: Array<{ username?: string; email?: string }> } }) => {
          const identifier = where.OR[0].username ?? where.OR[0].email ?? "";
          if (identifier.includes("ghost")) return null;
          return {
            id: "user-1",
            email: identifier,
            name: "Someone",
            role: "EDITOR",
            isActive: true,
            passwordHash: hash,
          };
        }
      ),
      update: vi.fn(async () => ({})),
    },
    $disconnect: vi.fn(async () => {}),
  },
}));

// Every attempt must fail on the password, so the only thing that can change the
// outcome is the limiter. `verifyPassword` returning false keeps bcrypt out of
// the test entirely.
vi.mock("@/lib/auth", () => ({
  verifyPassword: vi.fn(async () => false),
  signToken: vi.fn(() => "token"),
  hashPassword: vi.fn(async () => hash),
}));

// Imported once at module scope, not inside the request helper: a dynamic
// import per attempt meant fourteen module resolutions per test, which was slow
// enough to trip the default timeout when the whole suite ran in parallel.
import { POST as loginPost } from "@/app/api/v1/admin/login/route";

async function postLogin(identifier: string, forwardedFor: string) {
  return loginPost(
    new Request("http://127.0.0.1/api/v1/admin/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Rotated per attempt by the caller. This is the attack.
        "X-Forwarded-For": forwardedFor,
      },
      body: JSON.stringify({ identifier, password: "WrongPassword123!" }),
    })
  );
}

describe("login rate limiting survives a rotating X-Forwarded-For", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throttles an attacker who changes the header every attempt", async () => {
    // Distinct identifier per run so module-level bucket state cannot leak
    // between tests.
    const identifier = `rotate-${Date.now()}-${Math.random()}@kalisizocoop.coop`;

    const statuses: number[] = [];
    for (let i = 0; i < 14; i++) {
      const res = await postLogin(identifier, `203.0.113.${i}`);
      statuses.push(res.status);
    }

    // The attempts that were not throttled all reached the credential check,
    // which is the only thing this route can return for a wrong password.
    const evaluated = statuses.filter((s) => s === 401);
    const throttled = statuses.filter((s) => s === 429);

    expect(throttled.length).toBeGreaterThan(0);
    expect(evaluated.length).toBeLessThanOrEqual(10);
    expect(throttled.length + evaluated.length).toBe(statuses.length);
  });

  it("does not let a spent budget on one account throttle a different account", async () => {
    const attacker = `isolated-${Date.now()}-${Math.random()}@kalisizocoop.coop`;
    const victim = `victim-${Date.now()}-${Math.random()}@kalisizocoop.coop`;

    for (let i = 0; i < 12; i++) {
      await postLogin(attacker, `198.51.100.${i}`);
    }

    // A different account, and a different claimed origin, must still be able to
    // sign in. Otherwise the limiter itself becomes a denial-of-service tool.
    const res = await postLogin(victim, "198.51.100.200");
    expect(res.status).toBe(401);
  });

  it("responds identically for an existing and a non-existent account", async () => {
    const stamp = Date.now() - Math.random();
    const real = await postLogin(`real-${stamp}@kalisizocoop.coop`, "192.0.2.10");
    const ghost = await postLogin(`ghost-${stamp}@kalisizocoop.coop`, "192.0.2.11");

    // User enumeration: if these differ in status, body or headers, the login
    // form becomes a way to discover which addresses hold CMS accounts.
    expect(ghost.status).toBe(real.status);
    expect(await ghost.text()).toBe(await real.text());
    expect(real.status).toBe(401);
  });
});