import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression guard for the dashboard rate-limit self-DoS.
 *
 * The admin overview loads nine resources per run, three of which
 * (`inquiries:list`, `news:list`, `events:list`) are capped at 120 requests per
 * 15 minutes. The shared realtime timer fires every 4 seconds, so an
 * administrator who simply left the dashboard open issued roughly 135 requests a
 * minute against an 8-per-minute budget: their own CMS rate-limited them after
 * about eight minutes and every panel returned 429 for the rest of the window.
 *
 * The fix gives a subscriber an optional `minIntervalMs` floor. The important
 * subtlety, and the reason this test exists as its own file rather than a line in
 * `realtime-singleton.test.ts`, is *which* trigger the floor applies to:
 *
 *   - the timer tick is throttled, because an idle dashboard burning its own
 *     quota is the bug;
 *   - an SSE push is NOT throttled, because that means someone changed content
 *     and the whole point of the feature is that the CMS updates at once.
 *
 * Getting that backwards would trade a rate-limit bug for a silent
 * stale-content bug, and it would be invisible in manual testing.
 *
 * React is stubbed so the hook's subscribe logic can be driven without a DOM or
 * a renderer, matching `realtime-singleton.test.ts`.
 */

type Effect = () => (() => void) | void;

const effects: Effect[] = [];
let cleanups: (() => void)[] = [];

vi.mock("react", () => ({
  useRef: <T>(initial: T) => ({ current: initial }),
  useEffect: (fn: Effect) => {
    effects.push(fn);
  },
}));

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  closed = false;
  onerror: (() => void) | null = null;
  private handlers = new Map<string, ((ev: unknown) => void)[]>();

  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, fn: (ev: unknown) => void) {
    const list = this.handlers.get(type) ?? [];
    list.push(fn);
    this.handlers.set(type, list);
  }

  removeEventListener() {}

  emit(type: string, data?: unknown) {
    for (const fn of this.handlers.get(type) ?? []) {
      fn({ data: JSON.stringify(data ?? {}) });
    }
  }

  close() {
    this.closed = true;
  }
}

class FakeBroadcastChannel {
  static instances: FakeBroadcastChannel[] = [];
  onmessage: (() => void) | null = null;
  constructor(public name: string) {
    FakeBroadcastChannel.instances.push(this);
  }
  postMessage() {}
  close() {}
}

type RealtimeModule = typeof import("@/shared/realtime");

/**
 * Callbacks captured from the mocked `setTimeout`.
 *
 * `emitStaggered` runs the first subscriber inline and defers the rest by 60ms
 * each, so a multi-subscriber test has to flush the deferred half explicitly.
 * Collecting them keeps that visible instead of making the stub a no-op that
 * silently swallows every subscriber after the first.
 */
let deferred: Array<() => void> = [];

function flushStaggered() {
  const pending = deferred;
  deferred = [];
  for (const fn of pending) fn();
}

const listeners = () => ({
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  setInterval: vi.fn(() => 1),
  clearInterval: vi.fn(),
  setTimeout: vi.fn((fn: () => void) => {
    deferred.push(fn);
    return deferred.length;
  }),
});

async function loadModule(): Promise<RealtimeModule> {
  effects.length = 0;
  cleanups = [];
  vi.resetModules();
  return await import("@/shared/realtime");
}

function unsubscribeAll() {
  for (const fn of cleanups) fn();
  cleanups = [];
}

/**
 * Mount one subscriber and keep its teardown.
 *
 * `minIntervalMs` is forwarded so a test can opt a subscriber into throttling;
 * omit it to get the default every-tick behaviour.
 */
function subscribe(
  mod: RealtimeModule,
  fn: () => void,
  opts?: { collection?: string; minIntervalMs?: number },
) {
  // Only the effects this call registered. Re-running earlier subscribers'
  // effects would add a second listener per earlier subscriber and make the
  // counts below meaningless.
  const before = effects.length;
  mod.useRealtimePoll(fn, 4000, opts?.collection, {
    minIntervalMs: opts?.minIntervalMs,
  });
  for (const effect of effects.slice(before)) {
    const result = effect();
    if (typeof result === "function") cleanups.push(result);
  }
}

/** The callback the shared timer was started with. */
function tickFn(): () => void {
  const win = globalThis.window as unknown as {
    setInterval: { mock: { calls: unknown[][] } };
  };
  const calls = win.setInterval.mock.calls;
  expect(
    calls.length,
    "expected a shared interval to have been started",
  ).toBeGreaterThan(0);
  return calls[0][0] as () => void;
}

/** Fire the shared timer and let any staggered subscribers run. */
function tick() {
  tickFn()();
  flushStaggered();
}

let now = 1_700_000_000_000;
let nowSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  FakeEventSource.instances = [];
  FakeBroadcastChannel.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel);
  vi.stubGlobal("window", listeners());
  vi.stubGlobal("document", listeners());
  vi.stubGlobal("localStorage", {
    setItem: vi.fn(),
    getItem: vi.fn(),
    removeItem: vi.fn(),
  });
  now = 1_700_000_000_000;
  nowSpy = vi.spyOn(Date, "now").mockImplementation(() => now);
});

afterEach(() => {
  unsubscribeAll();
  nowSpy.mockRestore();
  vi.unstubAllGlobals();
});

describe("realtime timer throttle", () => {
  it("skips a throttled subscriber on a repeat tick inside its window", async () => {
    const mod = await loadModule();
    let runs = 0;

    subscribe(
      mod,
      () => {
        runs += 1;
      },
      { minIntervalMs: 60_000 },
    );

    tick();
    expect(runs).toBe(1);

    // Well inside the 60s floor. A second 4s tick must not run the panel.
    now += 4_000;
    tick();
    expect(runs).toBe(1);
  });

  it("re-runs a throttled subscriber once its window has elapsed", async () => {
    const mod = await loadModule();
    let runs = 0;

    subscribe(
      mod,
      () => {
        runs += 1;
      },
      { minIntervalMs: 60_000 },
    );

    tick();
    now += 59_000;
    tick();
    expect(runs).toBe(1);

    // Crosses the boundary.
    now += 2_000;
    tick();
    expect(runs).toBe(2);
  });

  it("leaves an unthrottled subscriber on every tick", async () => {
    const mod = await loadModule();
    let runs = 0;

    subscribe(mod, () => {
      runs += 1;
    });

    tick();
    now += 4_000;
    tick();
    now += 4_000;
    tick();

    expect(runs).toBe(3);
  });

  it("does not throttle an SSE push, so live edits still land immediately", async () => {
    const mod = await loadModule();
    let runs = 0;

    subscribe(
      mod,
      () => {
        runs += 1;
      },
      { collection: "news", minIntervalMs: 60_000 },
    );

    tick();
    expect(runs).toBe(1);

    // Inside the cooldown window, but a real content change happened.
    now += 1_000;
    FakeEventSource.instances[0].emit("update", { collections: ["news"] });

    expect(runs).toBe(2);
  });

  it("still lets a push reach a throttled subscriber even with no collection filter", async () => {
    const mod = await loadModule();
    let runs = 0;

    subscribe(
      mod,
      () => {
        runs += 1;
      },
      { minIntervalMs: 60_000 },
    );

    tick();
    now += 500;
    FakeEventSource.instances[0].emit("update", {});

    expect(runs).toBe(2);
  });

  it("applies a raised floor without slowing the shared timer for anyone else", async () => {
    const mod = await loadModule();

    subscribe(mod, () => {}, { minIntervalMs: 60_000 });
    const win = globalThis.window as unknown as {
      setInterval: { mock: { calls: unknown[][] } };
    };

    // A high floor on one subscriber must not become the shared tick rate: that
    // would slow every other panel down as a side effect.
    expect(win.setInterval.mock.calls[0][1]).toBe(mod.REALTIME_INTERVAL_MS);
  });

  it("mixes throttled and unthrottled subscribers on the same tick", async () => {
    const mod = await loadModule();
    const seen: string[] = [];

    subscribe(
      mod,
      () => {
        seen.push("slow");
      },
      { minIntervalMs: 60_000 },
    );
    subscribe(mod, () => {
      seen.push("fast");
    });

    tick();
    now += 4_000;
    tick();

    // Second tick: the throttled panel is skipped, the unthrottled one runs again.
    expect(seen).toEqual(["slow", "fast", "fast"]);
  });

  it("resets a subscriber's cooldown when it updates its floor", async () => {
    const mod = await loadModule();
    let runs = 0;

    subscribe(
      mod,
      () => {
        runs += 1;
      },
      { minIntervalMs: 60_000 },
    );

    tick();
    expect(runs).toBe(1);

    // Re-running every effect simulates a re-render that passes a new options
    // object. The listener must keep its identity (no timer teardown) and pick up
    // the new floor of 0, i.e. back to unthrottled.
    for (const effect of effects) effect();

    now += 4_000;
    tick();
    expect(runs).toBe(2);
  });

  it("keeps working after the throttled subscriber unmounts", async () => {
    const mod = await loadModule();
    let runs = 0;

    subscribe(
      mod,
      () => {
        runs += 1;
      },
      { minIntervalMs: 60_000 },
    );

    tick();
    unsubscribeAll();
    expect(FakeEventSource.instances[0].closed).toBe(true);

    // The captured tick must not resurrect the removed subscriber.
    tick();
    expect(runs).toBe(1);
  });
});

describe("overview poll floor", () => {
  /**
   * Source-level guard on the wiring itself.
   *
   * The behavioural tests above prove the throttle mechanism works. This proves
   * the dashboard actually uses it — a mechanism that is correct but unwired
   * leaves the original bug in place while every test passes.
   */
  const CLIENT = "src/app/admin/AdminClient.tsx";

  it("gives the overview a poll floor instead of the bare default", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(CLIENT, "utf8");

    // A bare `useRealtimePoll(load)` is the exact call that self-DoS'd.
    expect(source).not.toMatch(/useRealtimePoll\(load\)/);
    expect(source).toMatch(
      /useRealtimePoll\(\s*load,\s*undefined,\s*undefined,\s*\{/,
    );
  });

  it("settles the overview's nine requests independently", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(CLIENT, "utf8");

    // `Promise.all` rejected the whole dashboard on a single failure, so one
    // unreachable panel looked like the entire CMS was down.
    expect(source).toMatch(/Promise\.allSettled\(\[/);
  });
});
