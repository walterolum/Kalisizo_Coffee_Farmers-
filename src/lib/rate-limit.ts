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

export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? "unknown";
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}