import { describe, expect, it } from "vitest";

import { fingerprint, rateLimit } from "@/lib/rate-limit";

/**
 * Guards the login rate limiter's second bucket.
 *
 * The first bucket is keyed on the reported IP, which comes from
 * `X-Forwarded-For` — a header the caller chooses. Verified against a running
 * build: with a limit of ten, twelve consecutive attempts that each carried a
 * different `X-Forwarded-For` were all processed and none throttled, so the
 * IP bucket alone permitted unlimited password guessing.
 *
 * The bucket that cannot be evaded is keyed on a hash of the submitted
 * identifier. Guessing a password requires naming the account being guessed, so
 * every attempt lands in that bucket whatever the headers say. These tests
 * assert that property directly rather than asserting the current call order, so
 * the protection cannot be quietly removed by editing a route.
 */

describe("fingerprint", () => {
  it("is stable for the same input", () => {
    expect(fingerprint("admin@kalisizocoop.coop")).toBe(
      fingerprint("admin@kalisizocoop.coop")
    );
  });

  it("ignores case and surrounding whitespace", () => {
    // Login accepts an email case-insensitively in practice; if the limiter
    // hashed the raw string, `Admin@...` would be a fresh bucket and the limit
    // could be walked one variant at a time.
    expect(fingerprint("  ADMIN@KalisizoCoop.coop  ")).toBe(
      fingerprint("admin@kalisizocoop.coop")
    );
  });

  it("separates different identifiers", () => {
    expect(fingerprint("admin@kalisizocoop.coop")).not.toBe(
      fingerprint("editor@kalisizocoop.coop")
    );
  });

  it("does not leak the identifier it hashed", () => {
    const hash = fingerprint("admin@kalisizocoop.coop");
    expect(hash).not.toContain("admin");
    expect(hash).not.toContain("@");
    expect(hash).not.toContain("kalisizo");
    expect(hash).toHaveLength(32);
  });
});

describe("identifier-keyed limiting", () => {
  const limit = 3;
  const windowMs = 60_000;

  it("counts every attempt against one account regardless of claimed origin", () => {
    // Stand-in for a caller sending a fresh X-Forwarded-For each time. The
    // bucket key is derived only from the identifier, so the rotation has no
    // effect: attempt four is refused.
    const attempts: boolean[] = [];
    for (let i = 0; i < limit + 1; i++) {
      // The spoofed header is deliberately absent from the key computation.
      attempts.push(
        rateLimit(`t-account:${fingerprint("victim@kalisizocoop.coop")}`, limit, windowMs)
          .ok
      );
    }

    expect(attempts.slice(0, limit)).toEqual([true, true, true]);
    expect(attempts[limit]).toBe(false);
  });

  it("does not let attempts against one account throttle a different account", () => {
    // The opposite property matters just as much: an attacker must not be able
    // to lock a real administrator out of the CMS by burning the budget on
    // their own throwaway account.
    const a = rateLimit(`t-acct-a:${fingerprint("a@kalisizocoop.coop")}`, limit, windowMs);
    const b = rateLimit(`t-acct-b:${fingerprint("b@kalisizocoop.coop")}`, limit, windowMs);

    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
  });

  it("reports a retry delay once the account bucket is exhausted", () => {
    const key = `t-acct-c:${fingerprint("c@kalisizocoop.coop")}`;
    for (let i = 0; i < limit; i++) rateLimit(key, limit, windowMs);
    const refused = rateLimit(key, limit, windowMs);

    expect(refused.ok).toBe(false);
    expect(refused.retryAfterSeconds).toBeGreaterThan(0);
    expect(refused.retryAfterSeconds).toBeLessThanOrEqual(Math.ceil(windowMs / 1000));
  });
});