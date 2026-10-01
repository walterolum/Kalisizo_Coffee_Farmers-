import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression guard for the unbounded SSE subscriber set.
 *
 * `/api/v1/realtime/stream` is unauthenticated by necessity — public pages
 * subscribe to it as well as the CMS — so it is an open, long-lived connection
 * anyone on the internet can hold. Each one costs an entry in the broadcaster's
 * client Set plus a 25s heartbeat timer, and `EventSource` reconnects on its own,
 * so a script opening hundreds of tabs was enough to exhaust file descriptors and
 * timers on a single small server.
 *
 * `addRealtimeClient` now returns null once the ceiling is reached, and the route
 * turns that into a 503 rather than accepting the connection.
 */

type ServerModule = typeof import("@/lib/realtime-server");

const MAX_CLIENTS = 200;

/** Minimal stand-in for the ReadableStream controller the broadcaster holds. */
function fakeController() {
  return { enqueue: vi.fn(), close: vi.fn() } as unknown as ReadableStreamDefaultController<Uint8Array>;
}

async function loadModule(): Promise<ServerModule> {
  vi.resetModules();
  return await import("@/lib/realtime-server");
}

/** Clears the module-scoped singleton between tests. */
function resetClients() {
  const g = globalThis as unknown as {
    __kcRealtimeClients?: Set<unknown>;
    __kcRealtimeNextId?: number;
    __kcRealtimeVersion?: number;
  };
  g.__kcRealtimeClients = new Set();
  g.__kcRealtimeNextId = 1;
  g.__kcRealtimeVersion = undefined;
}

beforeEach(resetClients);
afterEach(() => {
  vi.restoreAllMocks();
});

describe("SSE subscriber ceiling", () => {
  it("accepts connections up to the ceiling", async () => {
    const mod = await loadModule();

    for (let i = 0; i < MAX_CLIENTS; i += 1) {
      expect(mod.addRealtimeClient(fakeController())).not.toBeNull();
    }
    expect(mod.realtimeClientCount()).toBe(MAX_CLIENTS);
  });

  it("refuses the connection that would exceed the ceiling", async () => {
    const mod = await loadModule();
    for (let i = 0; i < MAX_CLIENTS; i += 1) mod.addRealtimeClient(fakeController());

    expect(mod.addRealtimeClient(fakeController())).toBeNull();
    // The refused client must not be left behind in the Set.
    expect(mod.realtimeClientCount()).toBe(MAX_CLIENTS);
  });

  it("accepts new connections again once a client disconnects", async () => {
    const mod = await loadModule();
    const clients = [];
    for (let i = 0; i < MAX_CLIENTS; i += 1) clients.push(mod.addRealtimeClient(fakeController()));

    expect(mod.addRealtimeClient(fakeController())).toBeNull();

    mod.removeRealtimeClient(clients[0]!);

    expect(mod.realtimeClientCount()).toBe(MAX_CLIENTS - 1);
    expect(mod.addRealtimeClient(fakeController())).not.toBeNull();
  });

  it("broadcasts only to connected clients and drops dead ones", async () => {
    const mod = await loadModule();

    const alive = fakeController();
    const enqueue = vi.fn();
    const dead = { enqueue } as unknown as ReadableStreamDefaultController<Uint8Array>;

    mod.addRealtimeClient(alive);
    const deadClient = mod.addRealtimeClient(dead);
    // Simulate a socket that closed without a cancel() call: the enqueue throws,
    // which is the only signal the broadcaster gets.
    enqueue.mockImplementation(() => {
      throw new Error("socket closed");
    });

    expect(() => mod.broadcastRealtimeUpdate({ source: "test" })).not.toThrow();
    expect(mod.realtimeClientCount()).toBe(1);
    expect(deadClient).not.toBeNull();
  });
});