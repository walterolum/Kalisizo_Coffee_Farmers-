/**
 * Server-side realtime entry point.
 *
 * A facade over `@/lib/realtime-transport`, which selects a transport from the
 * environment. It exists so there is exactly one server import path. The
 * transport directory is deliberately *not* called `realtime`: `@/lib/realtime`
 * resolves to the sibling client hook file, and a `realtime/` directory beside a
 * `realtime.ts` resolves to the file, not the directory — so the abstraction
 * would have been unreachable by its own name.
 *
 * The client-registry exports (`addRealtimeClient` and friends) belong to the SSE
 * backend specifically. They are re-exported here because the stream route needs
 * them, and the route is the only consumer — see `streamBackendActive` for how
 * the route behaves when SSE is not the selected transport.
 */
import { realtimeStatus, getRealtimePublisher } from "@/lib/realtime-transport";
import type { RealtimeUpdateInput } from "@/lib/realtime-transport/protocol";

// Imported from the SSE module directly rather than through the index, because
// the client registry is specific to that backend: the index deliberately exports
// the transport contract and nothing backend-shaped.
import {
  addRealtimeClient,
  getRealtimeVersion,
  realtimeClientCount,
  removeRealtimeClient,
  sendRawSse,
} from "@/lib/realtime-transport/sse";

export {
  addRealtimeClient,
  getRealtimeVersion,
  realtimeClientCount,
  removeRealtimeClient,
  realtimeStatus,
};

/**
 * Whether SSE is the transport actually in use.
 *
 * The stream route checks this: with Supabase Broadcast selected, nothing
 * subscribes over SSE, and serving streams anyway would leave every browser
 * holding an open connection that can never receive anything.
 */
export function streamBackendActive(): boolean {
  return getRealtimePublisher()?.name === "sse";
}

/**
 * Tell every connected subscriber that something changed.
 *
 * Now asynchronous because the Supabase backend is a network call, and the
 * previous fire-and-forget call site was quietly wrong for it: on Vercel work
 * still in flight when the response is sent can be frozen, so a broadcast not
 * awaited would be dropped under load. Callers await this.
 *
 * Returns rather than throws. The row is already committed by the time this runs,
 * and reporting the save as failed would tell an admin their content was lost
 * when it is not.
 */
export async function broadcastRealtimeUpdate(
  payload: RealtimeUpdateInput = {}
): Promise<void> {
  const publisher = getRealtimePublisher();
  if (!publisher) {
    // Only reachable when a backend is pinned and unusable. Logged rather than
    // silent, because this is the configuration mistake that presents as "live
    // updates just quietly stopped working".
    console.error(
      `[realtime] no usable transport; update dropped. Status: ${JSON.stringify(realtimeStatus())}`
    );
    return;
  }

  await publisher.publishUpdate(payload);
}

/**
 * Send a named raw event to subscribers.
 *
 * Currently unused by the application — retained because it is the seam for
 * anything richer than a collection list (presence, typing indicators) and
 * removing it would mean re-deriving the fan-out for the SSE case later.
 *
 * The SSE backend has a generic fan-out; the Supabase backend does not implement
 * arbitrary event names, because every message on a public topic goes to every
 * subscriber anyway and inventing per-event semantics would not survive the
 * round trip. It logs rather than silently no-opping.
 */
export async function broadcastRaw(event: string, data: unknown): Promise<void> {
  const publisher = getRealtimePublisher();

  if (publisher?.name === "sse") {
    sendRawSse(event, data);
    return;
  }

  console.error(
    `[realtime] broadcastRaw("${event}") is not supported on the ${publisher?.name ?? "unavailable"} backend`
  );
}