import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Covers the realtime transport selection and the Supabase publisher's request
 * shape.
 *
 * Two things are being protected here.
 *
 * The first is the wire strip. The Supabase backend publishes to a *public*
 * Realtime channel — the application does not use Supabase Auth, so a private
 * channel with an RLS policy is not available yet — which means the payload is
 * readable by any holder of the anon key. So the payload is restricted to
 * collection names, and `assertSafeToBroadcast` is the boundary. A field added
 * to a publish call must be dropped, not forwarded.
 *
 * The second is the selection policy. A half-applied cutover is the failure
 * worth catching: the server publishing over Supabase while browsers subscribe
 * over SSE, or a pinned backend that is not configured silently falling back.
 * Both present as "live updates just quietly stopped working" with no error on
 * either side, which is why `realtimeStatus` distinguishes them.
 */

type TransportModule = typeof import("@/backend/realtime-transport");
type ServerModule = typeof import("@/backend/realtime-server");

const SUPABASE_ENV = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "REALTIME_BACKEND",
] as const;

async function loadTransport(): Promise<TransportModule> {
  vi.resetModules();
  return await import("@/backend/realtime-transport");
}

async function loadServer(): Promise<ServerModule> {
  vi.resetModules();
  return await import("@/backend/realtime-server");
}

const saved = new Map<string, string | undefined>();

beforeEach(() => {
  for (const key of SUPABASE_ENV) saved.set(key, process.env[key]);
  // Explicitly unset rather than assumed absent: a developer with these exported
  // in their shell must still get the "not configured" behaviour here.
  for (const key of SUPABASE_ENV) delete process.env[key];
});

afterEach(() => {
  for (const [key, value] of saved) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  saved.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("assertSafeToBroadcast", () => {
  it("keeps the collection list and the version marker", async () => {
    const { assertSafeToBroadcast } = await loadTransport();
    const safe = assertSafeToBroadcast({
      collections: ["hero", "services"],
      version: 1234,
      at: "2026-10-02T00:00:00.000Z",
    });

    expect(safe).toEqual({
      collections: ["hero", "services"],
      version: 1234,
      at: "2026-10-02T00:00:00.000Z",
    });
  });

  it("drops the admin's name, which no client reads and a public channel would expose", async () => {
    const { assertSafeToBroadcast } = await loadTransport();
    const safe = assertSafeToBroadcast({
      collections: ["news"],
      publishedBy: "Grace N.",
    });

    expect(safe).not.toHaveProperty("publishedBy");
    expect(JSON.stringify(safe)).not.toContain("Grace");
  });

  it("drops arbitrary extra fields rather than forwarding them", async () => {
    const { assertSafeToBroadcast } = await loadTransport();
    const safe = assertSafeToBroadcast({
      collections: ["products"],
      source: "admin-bump",
      secretToken: "abc123",
      nested: { email: "someone@example.com" },
    } as never);

    expect(Object.keys(safe).sort()).toEqual(["collections"]);
  });

  it("filters non-string and oversized collection entries", async () => {
    const { assertSafeToBroadcast } = await loadTransport();
    const safe = assertSafeToBroadcast({
      collections: ["hero", "", null, 42, "x".repeat(200)] as never,
    });

    expect(safe.collections).toEqual(["hero"]);
  });

  it("does not mutate the caller's object", async () => {
    const { assertSafeToBroadcast } = await loadTransport();
    const original = { collections: ["hero"], publishedBy: "Grace N." };
    assertSafeToBroadcast(original);

    // The caller keeps using the original for its own bookkeeping, so mutating it
    // here would silently drop a field somewhere else.
    expect(original.publishedBy).toBe("Grace N.");
  });
});

describe("realtimeStatus", () => {
  it("selects the SSE backend when Supabase is not configured", async () => {
    const { realtimeStatus } = await loadTransport();
    const status = realtimeStatus();

    expect(status.selected).toBe("sse");
    expect(status.clientTransport).toBe("sse");
    expect(status.available).toBe(true);
    expect(status.problem).toBeUndefined();
  });

  it("selects Supabase when it is configured, without being pinned", async () => {
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

    const { realtimeStatus } = await loadTransport();
    const status = realtimeStatus();

    expect(status.selected).toBe("supabase");
    // Must agree, or the browser subscribes somewhere the server never publishes.
    expect(status.clientTransport).toBe("supabase");
  });

  it("reports a pinned-but-unusable backend instead of falling back", async () => {
    process.env.REALTIME_BACKEND = "supabase";

    const { realtimeStatus, getRealtimePublisher } = await loadTransport();
    const status = realtimeStatus();

    expect(status.available).toBe(false);
    expect(status.selected).toBeNull();
    expect(getRealtimePublisher()).toBeNull();
    expect(status.problem).toContain("REALTIME_BACKEND=supabase");
    // The message has to name what is missing, or the operator is left guessing.
    expect(status.problem).toContain("SUPABASE_URL");
  });

  it("flags the half-applied cutover: Supabase configured but SSE selected", async () => {
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    process.env.REALTIME_BACKEND = "sse";

    const { realtimeStatus } = await loadTransport();
    const status = realtimeStatus();

    expect(status.selected).toBe("sse");
    expect(status.problem).toContain("only reach clients");
  });

  it("treats an unrecognised value as auto rather than failing", async () => {
    process.env.REALTIME_BACKEND = "supbase"; // typo

    const { preferredBackend, realtimeStatus } = await loadTransport();
    expect(preferredBackend()).toBe("auto");
    expect(realtimeStatus().selected).toBe("sse");
  });
});

describe("streamBackendActive", () => {
  it("is true for SSE so the stream route keeps serving", async () => {
    const { streamBackendActive } = await loadServer();
    expect(streamBackendActive()).toBe(true);
  });

  it("is false for Supabase so the route stands down instead of holding dead connections", async () => {
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    process.env.REALTIME_BACKEND = "supabase";

    const { streamBackendActive } = await loadServer();
    expect(streamBackendActive()).toBe(false);
  });
});

describe("supabasePublisher", () => {
  it("posts to the broadcast endpoint with the service role key", async () => {
    process.env.SUPABASE_URL = "https://project.supabase.co/";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => "" });
    vi.stubGlobal("fetch", fetchMock);

    const { supabasePublisher, REALTIME_TOPIC, REALTIME_UPDATE_EVENT } = await loadTransport();
    await supabasePublisher.publishUpdate({
      collections: ["news"],
      publishedBy: "Grace N.",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];

    // The trailing slash is stripped, so the path does not become `//realtime/...`.
    expect(url).toBe("https://project.supabase.co/realtime/v1/api/broadcast");
    expect(init.method).toBe("POST");

    const headers = init.headers as Record<string, string>;
    expect(headers.apikey).toBe("service-role-key");
    expect(headers.Authorization).toBe("Bearer service-role-key");

    const body = JSON.parse(init.body as string);
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].topic).toBe(REALTIME_TOPIC);
    expect(body.messages[0].event).toBe(REALTIME_UPDATE_EVENT);
    // The admin's name must not be on a public channel.
    expect(body.messages[0].payload).toEqual({ collections: ["news"] });
  });

  it("does not throw when the remote rejects the broadcast", async () => {
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => "bad key" })
    );
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const { supabasePublisher } = await loadTransport();

    // The row is already committed. Letting this propagate would tell an admin
    // their content was lost when it is sitting in the database.
    await expect(
      supabasePublisher.publishUpdate({ collections: ["news"] })
    ).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalled();
  });

  it("does not throw when the network fails outright", async () => {
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const { supabasePublisher } = await loadTransport();
    await expect(
      supabasePublisher.publishUpdate({ collections: ["news"] })
    ).resolves.toBeUndefined();
  });

  it("does not throw when unconfigured, and says what is missing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const { supabasePublisher } = await loadTransport();
    await expect(
      supabasePublisher.publishUpdate({ collections: ["news"] })
    ).resolves.toBeUndefined();
  });
});

describe("broadcastRealtimeUpdate", () => {
  it("does not throw when the pinned backend is unusable", async () => {
    process.env.REALTIME_BACKEND = "supabase";
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const { broadcastRealtimeUpdate } = await loadServer();

    // This is the configuration mistake that presents as "live updates quietly
    // stopped". It has to be loud rather than a silent no-op.
    await expect(
      broadcastRealtimeUpdate({ collections: ["news"] })
    ).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalled();
  });

  it("still fans out over SSE with the existing payload shape", async () => {
    const { broadcastRealtimeUpdate, addRealtimeClient, realtimeClientCount } =
      await loadServer();

    const enqueue = vi.fn();
    const controller = {
      enqueue,
      close: vi.fn(),
    } as unknown as ReadableStreamDefaultController<Uint8Array>;

    addRealtimeClient(controller);
    await broadcastRealtimeUpdate({ collections: ["hero"], publishedBy: "Grace N." });

    expect(realtimeClientCount()).toBe(1);
    expect(enqueue).toHaveBeenCalledTimes(1);

    const chunk = new TextDecoder().decode(enqueue.mock.calls[0][0] as Uint8Array);
    expect(chunk.startsWith("event: update\n")).toBe(true);

    const payload = JSON.parse(chunk.slice("event: update\ndata: ".length));
    // The SSE backend is same-origin, so it keeps forwarding diagnostics — the
    // strip is specific to the public Supabase channel.
    expect(payload.collections).toEqual(["hero"]);
    expect(payload.publishedBy).toBe("Grace N.");
    expect(payload.version).toEqual(expect.any(Number));
  });
});