import { describe, expect, it } from "vitest";
import {
  buildContentSecurityPolicy,
  buildRemoteImagePatterns,
  resolveAllowedOrigins,
  supabaseHost,
} from "@/shared/security-policy";

/**
 * Asserts the Content Security Policy opens exactly the Supabase origins the
 * cutover needs, and nothing more.
 *
 * This is the control that silently breaks the Supabase migration. Set
 * `STORAGE_BACKEND=supabase` and `REALTIME_BACKEND=supabase`, move the database
 * across, and the site still answers 200 to everything: Storage images render as
 * broken boxes because `img-src` never listed the host, live updates stop
 * arriving because `connect-src` blocks the Realtime websocket, and `next/image`
 * refuses the host outright rather than degrading. No request fails and no console
 * message names the policy.
 *
 * Two properties are pinned:
 *
 *   - with nothing configured the policy is exactly what it was before, so
 *     landing this changed no existing behaviour;
 *   - with a project configured it opens that host for images and both websocket
 *     schemes, and no other host.
 *
 * The second is the one that keeps the fix honest. A policy edited to
 * `img-src *` would make every assertion here pass and quietly remove the
 * protection entirely.
 */

/** Nothing configured — the state before any Supabase project exists. */
const NO_SUPABASE: Record<string, string | undefined> = {
  NEXT_PUBLIC_SUPABASE_URL: "",
  SUPABASE_URL: "",
};

/** A typical project ref. */
const CONFIGURED: Record<string, string | undefined> = {
  NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnop.supabase.co",
};

function directive(csp: string, name: string): string[] {
  const match = csp
    .split(";")
    .map((d) => d.trim())
    .find((d) => d.startsWith(`${name} `));
  return match ? match.split(/\s+/).slice(1) : [];
}

describe("supabaseHost", () => {
  it("returns null when nothing is configured", () => {
    expect(supabaseHost(NO_SUPABASE)).toBeNull();
  });

  it("prefers the public variable, so build-time inlining and runtime agree", () => {
    // If the two could disagree, the CSP baked into the build and the value the
    // browser's Realtime client uses would point at different projects.
    expect(
      supabaseHost({
        NEXT_PUBLIC_SUPABASE_URL: "https://public-ref.supabase.co",
        SUPABASE_URL: "https://server-ref.supabase.co",
      })
    ).toBe("public-ref.supabase.co");
  });

  it("falls back to the server variable when the public one is absent", () => {
    expect(
      supabaseHost({ NEXT_PUBLIC_SUPABASE_URL: "", SUPABASE_URL: "https://server-ref.supabase.co" })
    ).toBe("server-ref.supabase.co");
  });

  it("discards a trailing slash and any path", () => {
    expect(supabaseHost({ NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co/" })).toBe(
      "abc.supabase.co"
    );
    expect(supabaseHost({ NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co/rest/v1" })).toBe(
      "abc.supabase.co"
    );
  });

  it("returns null on a malformed URL rather than failing the build", () => {
    // Failing a deploy over a typo in an env var is worse than degrading to the
    // previous policy; the status scripts surface it as a named problem instead.
    expect(supabaseHost({ NEXT_PUBLIC_SUPABASE_URL: "not-a-url" })).toBeNull();
    expect(supabaseHost({ NEXT_PUBLIC_SUPABASE_URL: "   " })).toBeNull();
  });
});

describe("buildContentSecurityPolicy", () => {
  it("is unchanged when no Supabase project is configured", () => {
    const csp = buildContentSecurityPolicy({ isProduction: true, env: NO_SUPABASE });

    // The exact pre-existing policy. Asserting the whole string rather than the
    // absence of the new entries is what makes this a real regression guard — it
    // also catches an accidental widening elsewhere in the policy.
    expect(csp).toBe(
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob: https://res.cloudinary.com",
        "style-src 'self' 'unsafe-inline'",
        "font-src 'self' data:",
        "connect-src 'self'",
        "frame-src https://www.google.com https://maps.google.com",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'self'",
        "upgrade-insecure-requests",
      ].join("; ")
    );
  });

  it("allows the Supabase host for images", () => {
    const csp = buildContentSecurityPolicy({ isProduction: true, env: CONFIGURED });
    expect(directive(csp, "img-src")).toContain("https://abcdefghijklmnop.supabase.co");
  });

  it("allows both http and websocket schemes for realtime", () => {
    const csp = buildContentSecurityPolicy({ isProduction: true, env: CONFIGURED });
    const connect = directive(csp, "connect-src");

    // The browser upgrades to wss:// for Realtime and CSP matches on the literal
    // scheme, so an https-only entry would leave live updates blocked while every
    // other check passed.
    expect(connect).toContain("https://abcdefghijklmnop.supabase.co");
    expect(connect).toContain("wss://abcdefghijklmnop.supabase.co");
    // The same-origin API and the SSE stream must stay allowed.
    expect(connect).toContain("'self'");
  });

  it("keeps Cloudinary allowed so the rollback path survives the cutover", () => {
    const csp = buildContentSecurityPolicy({ isProduction: true, env: CONFIGURED });
    expect(directive(csp, "img-src")).toContain("https://res.cloudinary.com");
  });

  it("opens no host beyond Cloudinary, Supabase and Google Maps", () => {
    const csp = buildContentSecurityPolicy({ isProduction: true, env: CONFIGURED });
    // Schemas are listed alongside hosts; `data:` and `blob:` in img-src are
    // pre-existing and intentional for inline previews and object URLs.
    const allowed = [
      "cloudinary.com",
      "supabase.co",
      "google.com",
      "'self'",
      "'unsafe-inline'",
      "'none'",
      "data:",
      "blob:",
    ];

    for (const name of ["img-src", "connect-src", "script-src", "frame-src", "style-src"]) {
      for (const source of directive(csp, name)) {
        if (!allowed.some((a) => source.includes(a))) {
          throw new Error(`unexpected source in ${name}: ${source}`);
        }
      }
    }
  });

  it("never widens a directive to a wildcard", () => {
    const csp = buildContentSecurityPolicy({ isProduction: true, env: CONFIGURED });
    // `img-src *` would satisfy every assertion above while removing the policy.
    expect(csp).not.toMatch(/\b(img-src|connect-src|script-src)\s+(\*|data:)/);
  });

  it("keeps the injection vectors closed", () => {
    const csp = buildContentSecurityPolicy({ isProduction: true, env: CONFIGURED });
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("frame-ancestors 'self'");
  });

  it("allows unsafe-eval only outside production", () => {
    expect(buildContentSecurityPolicy({ isProduction: false, env: NO_SUPABASE })).toContain(
      "'unsafe-eval'"
    );
    expect(buildContentSecurityPolicy({ isProduction: true, env: NO_SUPABASE })).not.toContain(
      "'unsafe-eval'"
    );
  });

  it("adds upgrade-insecure-requests only in production", () => {
    expect(buildContentSecurityPolicy({ isProduction: true, env: NO_SUPABASE })).toContain(
      "upgrade-insecure-requests"
    );
    expect(buildContentSecurityPolicy({ isProduction: false, env: NO_SUPABASE })).not.toContain(
      "upgrade-insecure-requests"
    );
  });

  it("degrades to the unchanged policy on a malformed URL", () => {
    const csp = buildContentSecurityPolicy({
      isProduction: true,
      env: { NEXT_PUBLIC_SUPABASE_URL: "not-a-url" },
    });
    expect(csp).toContain("connect-src 'self'");
    expect(csp).not.toMatch(/supabase\.co/);
  });

  it("does not double the slash when composing origins", () => {
    const csp = buildContentSecurityPolicy({
      isProduction: true,
      env: { NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co/" },
    });
    expect(csp).not.toContain("co//");
  });
});

describe("buildRemoteImagePatterns", () => {
  it("keeps only Cloudinary when unconfigured", () => {
    expect(buildRemoteImagePatterns(NO_SUPABASE).map((p) => p.hostname)).toEqual([
      "res.cloudinary.com",
    ]);
  });

  it("adds the Supabase host when configured", () => {
    // This has to land in the same deploy as the storage switch: `next/image`
    // throws on an unlisted host, so a Supabase URL served without this entry is a
    // 500 on the page carrying it rather than a fallback.
    expect(buildRemoteImagePatterns(CONFIGURED).map((p) => p.hostname)).toEqual([
      "res.cloudinary.com",
      "abcdefghijklmnop.supabase.co",
    ]);
  });

  it("is https only and covers every path", () => {
    for (const pattern of buildRemoteImagePatterns(CONFIGURED)) {
      expect(pattern.protocol).toBe("https");
      expect(pattern.pathname).toBe("/**");
    }
  });
});

/**
 * The CORS origin the API advertises.
 *
 * The property that matters is the one that is easy to break by accident: a
 * deployment that forgets `ALLOWED_ORIGINS` gets a header naming
 * `localhost:3000`, which fails closed — correct, and completely silent. The only
 * symptom is a cross-origin request refused with an opaque browser error that
 * never mentions the variable at fault. `docker-compose.yml` sets it, so the
 * shipping path is fine; anyone running the standalone bundle elsewhere is the one
 * who needs to be told. Hence the warning, asserted below.
 */
describe("resolveAllowedOrigins", () => {
  it("advertises the single configured origin verbatim", () => {
    const result = resolveAllowedOrigins({
      ALLOWED_ORIGINS: "https://kalisizo.coffee",
    });

    // A browser mirrors the response origin back only if it matches exactly, so
    // this string has to survive the round trip unchanged.
    expect(result.allowOrigin).toBe("https://kalisizo.coffee");
  });

  it("trims whitespace and drops empty entries", () => {
    const result = resolveAllowedOrigins({
      ALLOWED_ORIGINS: " https://kalisizo.coffee , ,https://www.kalisizo.coffee ",
    });

    expect(result.origins).toEqual([
      "https://kalisizo.coffee",
      "https://www.kalisizo.coffee",
    ]);
  });

  it("serves '*' for a multi-origin setup", () => {
    // There is no way to express "these two, and only these two" in
    // `Access-Control-Allow-Origin`, so this is a deliberate trade: the API is
    // token-authenticated and cookie-free, so a cross-origin call arrives
    // unauthenticated and cannot act as the signed-in user. Sessions moving to
    // cookies invalidates this, which is why the reasoning lives next to the code.
    const result = resolveAllowedOrigins({
      ALLOWED_ORIGINS: "https://kalisizo.coffee,https://www.kalisizo.coffee",
    });

    expect(result.allowOrigin).toBe("*");
  });

  it("fails closed to the local default when unset", () => {
    const result = resolveAllowedOrigins({});

    expect(result.origins).toEqual(["http://localhost:3000"]);
    expect(result.allowOrigin).toBe("http://localhost:3000");
  });

  it("warns in production when unset, and names the variable", () => {
    const result = resolveAllowedOrigins({ NODE_ENV: "production" });

    // The warning is the whole point: without it this misconfiguration is
    // invisible until a browser refuses a request.
    expect(result.warning).toBeTruthy();
    expect(result.warning).toContain("ALLOWED_ORIGINS");
  });

  it("stays silent in production when the variable is set", () => {
    expect(
      resolveAllowedOrigins({
        NODE_ENV: "production",
        ALLOWED_ORIGINS: "https://kalisizo.coffee",
      }).warning
    ).toBeNull();
  });

  it("stays silent outside production, so local dev is not nagged", () => {
    expect(resolveAllowedOrigins({ NODE_ENV: "development" }).warning).toBeNull();
  });

  it("treats a blank value as unset rather than as a wildcard", () => {
    // The dangerous asymmetry this guards: `""` splits to an empty list, and an
    // empty list would otherwise fall through to `*`. So a trailing `=` in the
    // env file would open the API to every origin, while deleting the line
    // entirely closes it to all but localhost. Same mistake, opposite security
    // posture, purely from how it was typed.
    for (const blank of ["", "   ", " , "]) {
      const result = resolveAllowedOrigins({ NODE_ENV: "production", ALLOWED_ORIGINS: blank });

      expect(result.allowOrigin).not.toBe("*");
      expect(result.origins).toEqual(["http://localhost:3000"]);
      expect(result.warning).toBeTruthy();
    }
  });
});