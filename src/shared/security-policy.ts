/**
 * Builds the Content Security Policy and the `next/image` host allowlist.
 *
 * Extracted from `next.config.ts` so it can be tested directly. The config file
 * reads `process.env` at module scope and only exports a Next-shaped object, so
 * asserting on it meant spawning a process and scraping JSON out of it — which
 * tests the scraper at least as much as the policy.
 *
 * Both functions take their inputs as arguments for the same reason: a test that
 * cannot vary the environment cannot verify the unconfigured case, which is the
 * one that matters most. Landing the Supabase allowances must not change anything
 * until a project is actually configured, and that is only provable by reading
 * both branches.
 */

export type SecurityPolicyOptions = {
  isProduction: boolean;
  /** Defaults to `process.env`; passed explicitly by tests. */
  env?: Record<string, string | undefined>;
};

/**
 * Hostname of the Supabase project, or null when none is configured or the value
 * is malformed.
 *
 * Reads both the public and server variables because this is evaluated at build
 * time, where `NEXT_PUBLIC_*` is inlined, and the host is not a secret either way.
 * Deriving it rather than hardcoding a project ref means a rebuild against a
 * different project needs no code change.
 *
 * A malformed value returns null rather than throwing. Failing the build over a
 * typo in an environment variable is a worse outcome than degrading to the
 * pre-existing policy, and `npm run storage:status` / `npm run realtime:status`
 * surface a wrong URL as a named problem.
 */
export function supabaseHost(env: Record<string, string | undefined> = process.env): string | null {
  // `??` is not enough here. `.env.example` ships both variables blank, and an
  // empty string is not nullish — so `a ?? b` would take the blank public value
  // and never reach the server one. Setting SUPABASE_URL and leaving
  // NEXT_PUBLIC_SUPABASE_URL blank would then yield a policy with no Supabase
  // origin at all, which is the exact silent breakage this guards against.
  for (const raw of [env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_URL]) {
    if (!raw?.trim()) continue;
    try {
      // `.origin` rather than the raw string, so a trailing slash or a path is
      // discarded instead of producing a doubled slash in every composed entry.
      return new URL(raw.trim()).hostname;
    } catch {
      // Fall through rather than give up: a malformed public value should not
      // hide a perfectly good server one.
      continue;
    }
  }

  return null;
}

/**
 * The policy itself.
 *
 * The Supabase entries are the ones that matter for the cutover, and their
 * absence is a silent failure rather than a visible one: Storage images render as
 * broken boxes, live updates stop arriving because `connect-src` blocks the
 * Realtime websocket, and `next/image` refuses the host outright — while every
 * request still returns 200 and nothing in the console names the policy.
 *
 * `wss://` is listed because the browser upgrades to it for Realtime and CSP
 * matches on the literal scheme; an `https://` entry alone would not cover it.
 *
 * `object-src 'none'` and `base-uri 'self'` still block the main injection
 * vectors, which is what `unsafe-inline` on script-src is tolerated for:
 * Next.js emits inline hydration scripts and the design system uses inline style
 * attributes, so removing it requires a per-request nonce threaded through the
 * router. `unsafe-eval` is dev-server-only and dropped in production.
 */
export function buildContentSecurityPolicy({
  isProduction,
  env = process.env,
}: SecurityPolicyOptions): string {
  const supabase = supabaseHost(env);

  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isProduction ? "" : " 'unsafe-eval'"}`,
    `img-src 'self' data: blob: https://res.cloudinary.com${supabase ? ` https://${supabase}` : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    `connect-src 'self'${supabase ? ` https://${supabase} wss://${supabase}` : ""}`,
    "frame-src https://www.google.com https://maps.google.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
    ...(isProduction ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

export type RemoteImagePattern = {
  protocol: "https";
  hostname: string;
  pathname: string;
};

/**
 * The origins the API will answer cross-origin browser requests for.
 *
 * Lives here rather than inline in `next.config.ts` for the same reason the CSP
 * does: `next.config.ts` reads `process.env` at module scope, so asserting on it
 * directly means scraping a child process's stdout, which tests the scraper at
 * least as much as the policy.
 *
 * Browsers only mirror a single origin back, or `*`. For a multi-origin setup
 * there is no way to express "these three, and only these three", so this serves
 * `*` and relies on the API being token-authenticated.
 *
 * That reliance is worth stating plainly rather than inheriting quietly. It holds
 * because the API uses bearer tokens and never cookies, so a cross-origin request
 * arrives without credentials and cannot be replayed as the signed-in user. The
 * moment sessions move to cookies it stops holding, and `*` is not permitted
 * alongside credentials. The Supabase Auth migration is the change that makes this
 * true, so it is flagged for that work rather than left for someone to discover.
 */
export function resolveAllowedOrigins(
  env: Record<string, string | undefined> = process.env
): { origins: string[]; allowOrigin: string; warning: string | null } {
  // `??` alone is not enough. An unset variable and a variable set to "" are two
  // different mistakes, and only the second one is dangerous: "" splits to an
  // empty list, which the rule below would turn into `*` — so a trailing `=` in
  // the env file would open the API to every origin, while deleting the line
  // entirely closes it to all but localhost. The blank case has to be the same
  // mistake with the same outcome.
  // Parse the variable as given. Applying the default first would make every
  // unconfigured case look configured, and the warning below could then never
  // fire — the "did you forget it?" signal is derived from what was actually set.
  const origins = (env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  // Nothing survived: unset, empty, or nothing but separators. All three are the
  // same mistake, so they get the same outcome. The check is on the *parsed*
  // list rather than the raw string, because `" , "` is non-blank yet yields no
  // origins, and treating that as configured would be the asymmetry this guards.
  const configured = origins.length > 0;
  const effective = configured ? origins : ["http://localhost:3000"];

  return {
    origins: effective,
    allowOrigin: effective.length === 1 ? effective[0] : "*",
    // The default names a host unrelated to most deployments, which fails closed
    // and correctly, but silently: a cross-origin fetch is refused with an opaque
    // network error that never names the variable at fault. `docker-compose.yml`
    // sets ALLOWED_ORIGINS correctly, so the shipping path is unaffected — this
    // exists for anyone deploying the standalone bundle some other way.
    warning:
      env.NODE_ENV === "production" && !configured
        ? "ALLOWED_ORIGINS is not set to any origin, so the API will answer with " +
          `'Access-Control-Allow-Origin: ${effective[0]}'. Same-origin use is ` +
          "unaffected, but every cross-origin client will be blocked. Set " +
          "ALLOWED_ORIGINS to the comma-separated browser origins that need API access."
        : null,
  };
}

/**
 * Hosts `next/image` may optimise.
 *
 * Cloudinary stays regardless, because it is the current upload backend and the
 * rollback path: dropping it during a cutover to Supabase would break every
 * existing media URL in the database.
 *
 * This has to land in the same deployment as the storage switch. `next/image`
 * throws on an unlisted host rather than degrading, so a Supabase URL served by a
 * config without this entry is a 500 on the page carrying it.
 */
export function buildRemoteImagePatterns(
  env: Record<string, string | undefined> = process.env
): RemoteImagePattern[] {
  const supabase = supabaseHost(env);

  return [
    { protocol: "https", hostname: "res.cloudinary.com", pathname: "/**" },
    ...(supabase ? [{ protocol: "https" as const, hostname: supabase, pathname: "/**" }] : []),
  ];
}