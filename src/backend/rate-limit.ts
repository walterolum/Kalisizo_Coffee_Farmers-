import { createHash } from "node:crypto";

const buckets = new Map<string, { times: number[]; windowMs: number }>();
const MAX_BUCKETS = 5000;
let lastPrune = 0;

export type RateLimitResult = { ok: boolean; retryAfterSeconds: number };

function prune(now: number): void {
  if (now - lastPrune < 60_000 || buckets.size <= MAX_BUCKETS) return;
  lastPrune = now;
  for (const [key, bucket] of buckets) {
    const active = bucket.times.filter((t) => now - t < bucket.windowMs);
    if (active.length === 0) buckets.delete(key);
  }
}

export function rateLimit(
  identifier: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(identifier);
  const times = (bucket?.times ?? []).filter((t) => now - t < windowMs);

  if (times.length >= limit) {
    buckets.set(identifier, { times, windowMs });
    const retryAfterSeconds = Math.max(
      Math.ceil((windowMs - (now - times[0])) / 1000),
      1
    );
    return { ok: false, retryAfterSeconds };
  }

  times.push(now);
  buckets.set(identifier, { times, windowMs });
  prune(now);
  return { ok: true, retryAfterSeconds: 0 };
}

/**
 * A stable, non-reversible bucket key for a value that identifies *who is being
 * attacked* rather than who is attacking.
 *
 * Used for the login limiter's second bucket. Guessing a password requires
 * naming the account being guessed, so a bucket keyed on the submitted
 * identifier cannot be evaded by rotating request headers — which is exactly
 * what an IP-keyed bucket can be.
 *
 * Hashed so the bucket map never holds a plaintext email address in memory, and
 * truncated because this is a map key, not a credential.
 */
export function fingerprint(value: string): string {
  return createHash("sha256")
    .update(value.trim().toLowerCase())
    .digest("hex")
    .slice(0, 32);
}

/**
 * The caller's IP, as reported by the edge.
 *
 * This trusts `X-Forwarded-For`, which any client may set to an arbitrary value.
 * That is safe when a proxy we control rewrites the header (nginx, Cloudflare,
 * Vercel — all of which overwrite rather than append the client-supplied value)
 * and unsafe when the application is reachable directly, because then the header
 * is whatever the caller typed.
 *
 * Verified against the running build: with a limit of 10 attempts, 12 consecutive
 * logins each carrying a different `X-Forwarded-For` were all processed and none
 * throttled.
 *
 * An IP-keyed bucket therefore cannot be the only defence on the login path,
 * which is why `login/route.ts` also limits on a hash of the submitted
 * identifier — a value the caller cannot change without changing which account
 * they are attacking. That bucket holds regardless of proxy topology.
 *
 * The remaining exposure here is abuse volume rather than credential guessing:
 * contact-form spam and the admin/SSE request ceilings. Both are mitigated today
 * by being secondary to authentication. Tightening them properly means deciding
 * the deployment's proxy topology and making proxy trust explicit, which is a
 * hosting-configuration decision rather than a code change.
 */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? "unknown";
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}