// Server-side realtime broadcaster for SSE.
// Uses globalThis to survive HMR / keep singleton across hot reloads in dev.

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

export function realtimeClientCount(): number {
  return getClients().size;
}

function nextId(): number {
  if (globalThis.__kcRealtimeNextId == null) globalThis.__kcRealtimeNextId = 1;
  return globalThis.__kcRealtimeNextId++;
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

export function addRealtimeClient(controller: ReadableStreamDefaultController<Uint8Array>): Client | null {
  const clients = getClients();
  if (clients.size >= MAX_CLIENTS) return null;
  const client: Client = { id: nextId(), controller };
  clients.add(client);
  return client;
}

export function removeRealtimeClient(client: Client): void {
  const clients = getClients();
  clients.delete(client);
}

export function broadcastRealtimeUpdate(payload: Record<string, unknown> = {}): void {
  const version = bumpRealtimeVersion();
  const data = JSON.stringify({ type: "update", version, at: new Date().toISOString(), ...payload });
  const chunk = `event: update\ndata: ${data}\n\n`;
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
  // also send a heartbeat to keep connections alive (optional)
}

export function broadcastRaw(event: string, data: unknown): void {
  const chunk = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  const encoded = new TextEncoder().encode(chunk);
  const clients = getClients();
  for (const client of Array.from(clients)) {
    try {
      client.controller.enqueue(encoded);
    } catch {
      clients.delete(client);
    }
  }
}
