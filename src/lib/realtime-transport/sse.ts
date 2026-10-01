/**
 * The in-process SSE broadcaster.
 *
 * This is the existing implementation, wrapped to the transport contract so it
 * can be selected or replaced without the call sites knowing. See `types.ts` for
 * why it is the backend that a horizontal deployment has to outgrow.
 *
 * The client-registry half is unchanged and still exported for the stream route.
 */
import type {
  RealtimeBackendName,
  RealtimePublisher,
  RealtimeUpdateInput,
} from "./protocol";

type Client = {
  id: number;
  controller: ReadableStreamDefaultController<Uint8Array>;
};

declare global {
  var __kcRealtimeClients: Set<Client> | undefined;
  var __kcRealtimeNextId: number | undefined;
  var __kcRealtimeVersion: number | undefined;
}

function getClients(): Set<Client> {
  // globalThis rather than a module variable so the registry survives the module
  // being re-evaluated on hot reload in development; two registries during a
  // reload would silently drop every connected client.
  if (!globalThis.__kcRealtimeClients) {
    globalThis.__kcRealtimeClients = new Set<Client>();
  }
  return globalThis.__kcRealtimeClients;
}

/**
 * Ceiling on concurrent SSE subscribers.
 *
 * The stream endpoint is reachable without a session — the admin client and any
 * public page both subscribe — so it is an open connection an unauthenticated
 * caller can hold. Each one costs a Set entry and a 25s heartbeat timer for as
 * long as it stays open, and EventSource reconnects automatically, so a single
 * script opening hundreds of tabs is enough to exhaust file descriptors and
 * timers. Rejecting past this ceiling turns that from a resource leak into a
 * clean 503. A real deployment has a handful of tabs open, nowhere near this.
 */
const MAX_CLIENTS = 200;

function nextId(): number {
  if (globalThis.__kcRealtimeNextId == null) globalThis.__kcRealtimeNextId = 1;
  return globalThis.__kcRealtimeNextId++;
}

export function realtimeClientCount(): number {
  return getClients().size;
}

export function getRealtimeVersion(): number {
  if (globalThis.__kcRealtimeVersion == null) globalThis.__kcRealtimeVersion = Date.now();
  return globalThis.__kcRealtimeVersion;
}

export function bumpRealtimeVersion(): number {
  const v = Date.now();
  globalThis.__kcRealtimeVersion = v;
  return v;
}

export function addRealtimeClient(
  controller: ReadableStreamDefaultController<Uint8Array>
): Client | null {
  const clients = getClients();
  if (clients.size >= MAX_CLIENTS) return null;
  const client: Client = { id: nextId(), controller };
  clients.add(client);
  return client;
}

export function removeRealtimeClient(client: Client): void {
  getClients().delete(client);
}

/** Enqueue a chunk to every subscriber, pruning any whose stream has closed. */
function fanOut(chunk: string): void {
  const encoded = new TextEncoder().encode(chunk);
  const clients = getClients();
  for (const client of Array.from(clients)) {
    try {
      client.controller.enqueue(encoded);
    } catch {
      // client disconnected
      clients.delete(client);
    }
  }
}

/**
 * Send a named event with an arbitrary JSON body.
 *
 * Exposed for `broadcastRaw`, which has no equivalent on a Supabase broadcast
 * topic. Kept next to the fan-out it depends on rather than reaching in for it.
 */
export function sendRawSse(event: string, data: unknown): void {
  fanOut(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export const ssePublisher: RealtimePublisher = {
  name: "sse" as RealtimeBackendName,

  configured(): boolean {
    // Always available: it needs no configuration and no network.
    return true;
  },

  async publishUpdate(update: RealtimeUpdateInput): Promise<void> {
    // Enqueueing is synchronous and cannot fail in a way the caller can act on,
    // but the contract is async so the Supabase backend can honour the same shape.
    //
    // Forwarded whole, without the strip the Supabase backend applies: these
    // clients connected to this server over a same-origin EventSource, so a
    // diagnostic field is going back to a browser that already has the page.
    const version = update.version ?? bumpRealtimeVersion();
    const body = {
      ...update,
      type: "update",
      version,
      at: update.at ?? new Date().toISOString(),
    };
    fanOut(`event: update\ndata: ${JSON.stringify(body)}\n\n`);
  },

  clientCount(): number {
    return realtimeClientCount();
  },
};