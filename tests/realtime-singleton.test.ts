import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression guard for the connection-exhaustion bug.
 *
 * Every component used to call `useRealtimePoll` and each call opened its own
 * `EventSource`. A single page mounted ~15 of them, all long-lived, against one
 * origin. Browsers cap concurrent HTTP/1.1 connections per origin at six, so
 * the pool saturated permanently and the page stopped responding to clicks even
 * though it rendered correctly from server HTML.
 *
 * React is stubbed so the hook's real subscribe/unsubscribe logic can be driven
 * without a DOM or a renderer.
 */

type Effect = () => (() => void) | void;

const effects: Effect[] = [];
let cleanups: (() => void)[] = [];

vi.mock("react", () => ({
  useRef: <T,>(initial: T) => ({ current: initial }),
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

const listeners = () => ({
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  setInterval: vi.fn(() => 1),
  clearInterval: vi.fn(),
  setTimeout: vi.fn(),
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

/** Mount one subscriber and keep its teardown. */
async function subscribe(mod: RealtimeModule, collection?: string) {
  const before = effects.length;
  mod.useRealtimePoll(() => {}, 4000, collection);
  for (const effect of effects.slice(before)) {
    const result = effect();
    if (typeof result === "function") cleanups.push(result);
  }
}

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
});

afterEach(() => {
  unsubscribeAll();
  vi.unstubAllGlobals();
});

describe("useRealtimePoll transport", () => {
  it("opens a single SSE connection no matter how many components subscribe", async () => {
    const mod = await loadModule();

    await subscribe(mod, "settings");
    await subscribe(mod, "hero");
    await subscribe(mod, "services");
    await subscribe(mod, "products");
    await subscribe(mod, "stories");
    await subscribe(mod, "leadership");
    await subscribe(mod, "faq");
    await subscribe(mod, "locations");
    await subscribe(mod, "inquiries");

    // Nine subscribers — the old implementation opened nine EventSources.
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0].url).toBe(mod.REALTIME_SSE_URL);
  });

  it("starts a single shared poll timer", async () => {
    const mod = await loadModule();

    await subscribe(mod, "settings");
    await subscribe(mod, "hero");
    await subscribe(mod, "services");

    const windowStub = globalThis.window as unknown as { setInterval: { mock: { calls: unknown[][] } } };
    const setIntervalCalls = windowStub.setInterval.mock.calls;
    expect(setIntervalCalls).toHaveLength(1);
    expect(setIntervalCalls[0][1]).toBe(mod.REALTIME_INTERVAL_MS);
  });

  it("closes the connection once the last subscriber unmounts", async () => {
    const mod = await loadModule();

    await subscribe(mod, "settings");
    await subscribe(mod, "hero");
    expect(FakeEventSource.instances[0].closed).toBe(false);

    unsubscribeAll();
    expect(FakeEventSource.instances[0].closed).toBe(true);
  });

  it("wakes every subscriber on a generic update", async () => {
    const mod = await loadModule();
    const seen: string[] = [];

    mod.useRealtimePoll(() => seen.push("a"), 4000, "settings");
    mod.useRealtimePoll(() => seen.push("b"), 4000, "hero");
    for (const effect of effects) effect();

    FakeEventSource.instances[0].emit("update", {});

    expect(seen).toEqual(["a", "b"]);
  });

  it("wakes only the matching subscriber when the payload names collections", async () => {
    const mod = await loadModule();
    const seen: string[] = [];

    mod.useRealtimePoll(() => seen.push("hero"), 4000, "hero");
    mod.useRealtimePoll(() => seen.push("settings"), 4000, "settings");
    for (const effect of effects) effect();

    FakeEventSource.instances[0].emit("update", { collections: ["hero"] });

    expect(seen).toEqual(["hero"]);
  });

  it("isolates a throwing subscriber from the others", async () => {
    const mod = await loadModule();
    const seen: string[] = [];

    mod.useRealtimePoll(() => {
      throw new Error("boom");
    }, 4000, "hero");
    mod.useRealtimePoll(() => seen.push("ok"), 4000, "settings");
    for (const effect of effects) effect();

    expect(() => FakeEventSource.instances[0].emit("update", {})).not.toThrow();
    expect(seen).toEqual(["ok"]);
  });

  it("keeps notifyRealtimeUpdate safe when the browser APIs are absent", async () => {
    const mod = await loadModule();
    vi.stubGlobal("window", undefined);
    expect(() => mod.notifyRealtimeUpdate()).not.toThrow();
  });
});
