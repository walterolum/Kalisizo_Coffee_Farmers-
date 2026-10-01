import { describe, expect, it } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * The brief is explicit that hiding a menu item is not security. This test is the
 * reason that can be trusted rather than assumed.
 *
 * It is deliberately behavioural. An earlier version of this file searched the
 * route sources for the text "requirePermission(" and passed even after that call
 * was deleted, because merely importing the module that defines the function is
 * enough to satisfy the search. A check that cannot fail is worse than no check,
 * so the routes are imported and actually called.
 *
 * Every admin handler is invoked with no credentials. It must refuse. If a route
 * ever serves data to an anonymous caller, this fails — which is the whole point.
 */

const ROUTE_DIR = "src/app/api/v1/admin";

/**
 * The one endpoint an anonymous caller is allowed to reach, because it is what
 * issues sessions. It is throttled instead of authenticated; see the login
 * throttle assertions below.
 */
const SESSION_ISSUING = "src/app/api/v1/admin/login/route.ts";

type RouteFile = {
  /** Import specifier for the module, relative to the project root. */
  specifier: string;
  /** Path with dynamic segments made concrete, e.g. ".../news/[id]" -> news/id. */
  params: Record<string, string>;
  file: string;
};

function walk(dir: string, specifierPrefix = "", params: Record<string, string> = {}): RouteFile[] {
  const out: RouteFile[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full, `${specifierPrefix}${entry}/`, params));
      continue;
    }
    if (entry !== "route.ts") continue;
    const file = resolve(full).replace(/\\/g, "/");
    const specifier = `@/app/api/v1/admin/${specifierPrefix}route`;
    const concrete: Record<string, string> = {};
    for (const segment of specifierPrefix.split("/").filter(Boolean)) {
      const dynamic = segment.match(/^\[(\.\.\.)?(\w+)\]$/);
      if (dynamic) concrete[dynamic[2]!] = "probe-id-not-a-real-record";
    }
    out.push({ file, specifier, params: { ...params, ...concrete } });
  }
  return out;
}

const ROUTES = walk(ROUTE_DIR);
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

type Handler = (req: Request, context: { params: Promise<Record<string, string>> }) => Promise<Response>;

/** Refusals. A 429 also counts: throttling is still not serving the request. */
const REFUSALS = [401, 403, 429];

describe("admin routes refuse anonymous callers", () => {
  it("discovered the admin route tree", () => {
    expect(ROUTES.length).toBeGreaterThan(20);
  });

  it.each(ROUTES.map((r) => [r.file, r] as const))(
    "%s",
    async (_name, route) => {
      const mod = (await import(/* @vite-ignore */ route.specifier)) as Record<string, unknown>;
      const handlers = METHODS.filter((m) => typeof mod[m] === "function");
      expect(handlers.length, `${route.file} exports no handler`).toBeGreaterThan(0);

      for (const method of handlers) {
        const request = new Request("http://localhost/api/v1/admin/probe", {
          method,
          headers: { "content-type": "application/json" },
          body: method === "GET" || method === "DELETE" ? undefined : "{}",
        });

        let response: Response;
        try {
          response = await (mod[method] as Handler)(request, {
            params: Promise.resolve(route.params),
          });
        } catch (error) {
          throw new Error(
            `${method} ${route.file} threw instead of refusing: ${String(error)}`
          );
        }

        if (route.file.endsWith(SESSION_ISSUING)) continue;

        expect(
          REFUSALS,
          `${method} ${route.file} answered ${response.status} to an unauthenticated caller ` +
            "instead of refusing; a hidden sidebar item is not access control"
        ).toContain(response.status);
      }
    },
    // Explicit rather than the 5s default. Each case dynamically imports a route
    // module, and several reach bcrypt at cost 12, so the cost here is real work
    // rather than a hanging promise. On a loaded machine — a concurrent Docker
    // build, a CI runner sharing cores — the default budget expired
    // intermittently and surfaced as a timeout that looked like a security
    // failure. A slow test is a nuisance; a security test that fails at random
    // trains people to ignore it, which is worse.
    30_000
  );
});

describe("the session-issuing endpoint", () => {
  // Each attempt performs a bcrypt comparison at cost 12 against the dummy hash,
  // on purpose, so that an unknown account is as slow to reject as a real one.
  // That defence costs real time, hence the generous budget here.
  it("is throttled, because it is the only route an anonymous caller may reach", async () => {
    const mod = await import("@/app/api/v1/admin/login/route");
    const statuses: number[] = [];
    // 10 attempts per 15 minutes is the configured budget, so a later attempt
    // from the same address must be refused even with a correct password.
    for (let attempt = 0; attempt < 12; attempt++) {
      const response = await mod.POST(
        new Request("http://localhost/api/v1/admin/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ identifier: "probe", password: "not-a-real-password" }),
        })
      );
      statuses.push(response.status);
    }
    expect(statuses.some((s) => s === 429), `statuses were ${statuses.join(",")}`).toBe(true);
    // No attempt may ever be a success, even before the limit is reached.
    expect(statuses.filter((s) => s === 200)).toHaveLength(0);
  }, 60_000);
});
