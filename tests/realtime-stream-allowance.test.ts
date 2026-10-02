import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression guard for the SSE per-IP allowance.
 *
 * `/api/v1/realtime/stream` is unauthenticated, so it is limited on resource
 * grounds. Two controls exist: an attempts-per-window counter per IP here, and a
 * concurrent subscriber cap in the broadcaster (`realtime-client-cap.test.ts`
 * covers that one).
 *
 * The per-IP counter was 6 per minute. The client opens exactly one EventSource
 * per page load — `realtime-singleton.test.ts` pins that — so six page views a
 * minute is the entire budget. The site has eleven public pages, so an ordinary
 * visitor reading their way through it ran out halfway and every page after that
 * got a 429.
 *
 * What made it worse is that nothing recovered on its own. Per the HTML spec
 * `EventSource` does not retry after a non-200 response; it fails the connection
 * and stays closed. So the page still rendered, still looked correct, and simply
 * stopped reflecting an editor's changes — with no error shown to the reader.
 *
 * These tests drive the real route handler, not a copy of its arithmetic, so they
 * fail if the constant is lowered again for any reason.
 */

type StreamModule = typeof import("@/app/api/v1/realtime/stream/route");

/** Stands in for the broadcaster so the route runs its full admission path. */
function mockBroadcaster() {
  vi.doMock("@/lib/realtime-server", () => ({
    addRealtimeClient: vi.fn(() => ({ id: 1, controller: {} })),
    removeRealtimeClient: vi.fn(),
    getRealtimeVersion: vi.fn(() => 1_700_000_000_000),
    realtimeClientCount: vi.fn(() => 1),
    // SSE is the selected transport, so the route serves rather than standing down.
    streamBackendActive: vi.fn(() => true),
  }));
}

async function loadRoute(): Promise<StreamModule> {
  vi.resetModules();
  mockBroadcaster();
  return await import("@/app/api/v1/realtime/stream/route");
}

/** Clears the in-memory rate-limit buckets so each test starts fresh. */
function resetBuckets() {
  const g = globalThis as unknown as { __kcRateLimitBuckets?: unknown };
  g.__kcRateLimitBuckets = new Map();
}

function request(ip: string): Request {
  return new Request("http://localhost/api/v1/realtime/stream", {
    headers: { "x-forwarded-for": ip },
  });
}

/**
 * Counts how many of `count` sequential connection attempts are refused.
 *
 * Sequential rather than concurrent, because that is how browsing actually looks:
 * one tab, moving from page to page, the previous stream closing as it goes.
 */
async function refusalRate(GET: StreamModule["GET"], count: number, ip = "203.0.113.9") {
  let refused = 0;
  for (let i = 0; i < count; i++) {
    const res = await GET(request(ip));
    // Release the body so an unconsumed stream cannot hold the test open.
    await res.body?.cancel().catch(() => {});
    if (res.status === 429) refused++;
  }
  return refused;
}

beforeEach(resetBuckets);
afterEach(() => {
  vi.resetModules();
  vi.doUnmock("@/lib/realtime-server");
  vi.restoreAllMocks();
});

describe("SSE per-IP connection allowance", () => {
  it("serves a visitor working through the whole site without refusing", async () => {
    const { GET } = await loadRoute();

    // Eleven public pages, read in one sitting. Under the old limit of 6 this
    // refused five of them.
    expect(await refusalRate(GET, 11)).toBe(0);
  });

  it("serves a browsing session with back/forward and refreshes", async () => {
    const { GET } = await loadRoute();

    // Comfortably above the eleven-page walk-through, and still nothing unusual.
    expect(await refusalRate(GET, 25)).toBe(0);
  });

  it("still refuses once the allowance is genuinely exhausted", async () => {
    const { GET } = await loadRoute();

    // The control has to still exist. If this ever returns 0 the endpoint is
    // unlimited, which is the failure the limit exists to prevent.
    expect(await refusalRate(GET, 45)).toBeGreaterThan(0);
  });

  it("starts counting again once the window has rolled forward", async () => {
    const { GET } = await loadRoute();

    const ip = "203.0.113.20";
    expect(await refusalRate(GET, 45, ip)).toBeGreaterThan(0);

    // The limiter keys on wall-clock time, so a window that has genuinely rolled
    // forward has to restore the allowance. Driven by fake timers rather than by
    // inspecting the module's private bucket Map: the assertion then describes
    // what an operator observes — the endpoint lets the address back in after a
    // minute — instead of how it happens to be stored.
    //
    // This is also what pins CONNECT_WINDOW_MS. A window widened to an hour
    // leaves the limiter passing, but the allowance would not return here, so
    // the constant cannot be loosened without this failing.
    let refusedAfterWindow = 0;
    vi.useFakeTimers();
    try {
      vi.advanceTimersByTime(61_000);

      for (let i = 0; i < 11; i++) {
        const res = await GET(request(ip));
        await res.body?.cancel().catch(() => {});
        if (res.status === 429) refusedAfterWindow++;
      }
    } finally {
      // Restored before the assertion: the route stamps its hello event with a
      // timestamp, and leaving a stubbed clock in place would make any later
      // assertion depend on when this file happened to run.
      vi.useRealTimers();
    }

    // A full eleven-page walk-through is served again, as it is for a fresh
    // visitor who has spent nothing.
    expect(refusedAfterWindow).toBe(0);
  });

  it("counts each address separately", async () => {
    const { GET } = await loadRoute();

    // One visitor exhausting their budget must not consume anyone else's.
    await refusalRate(GET, 45, "203.0.113.9");
    expect(await refusalRate(GET, 5, "198.51.100.4")).toBe(0);
  });

  it("tells the browser when to come back", async () => {
    const { GET } = await loadRoute();

    await refusalRate(GET, 45);

    // Read from a clean budget so the refusal is this request's own.
    vi.resetModules();
    const fresh = await loadRoute();
    for (let i = 0; i < 45; i++) {
      const res = await fresh.GET(request("203.0.113.77"));
      await res.body?.cancel().catch(() => {});
    }
    const refused = await fresh.GET(request("203.0.113.77"));

    expect(refused.status).toBe(429);
    // Without this the browser has no idea whether to wait or to give up.
    expect(Number(refused.headers.get("Retry-After"))).toBeGreaterThan(0);
  });
});
