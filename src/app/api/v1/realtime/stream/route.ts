import {
  addRealtimeClient,
  getRealtimeVersion,
  realtimeClientCount,
  removeRealtimeClient,
  streamBackendActive,
} from "@/lib/realtime-server";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

/**
 * The SSE endpoint every open tab subscribes to.
 *
 * It is unauthenticated by necessity — public pages use it too — so it is
 * protected on resource grounds instead of access grounds. Two limits apply:
 * a per-IP allowance on new connections, and a hard ceiling on concurrent
 * subscribers inside the broadcaster. Both exist because a connection held open
 * costs a Set entry and a heartbeat timer, and EventSource reconnects on its
 * own, so an open endpoint is an easy way to run the server out of descriptors.
 */
/**
 * Connection attempts allowed per IP per minute.
 *
 * This was 6, which is below the floor of ordinary use and refused real
 * visitors. The client opens exactly one EventSource per page load
 * (`realtime-singleton.test.ts` pins that), so the budget is spent one per page
 * viewed. The site has eleven public pages: someone reading their way through it,
 * or using back/forward and the odd refresh, spends twenty or thirty in a minute
 * without doing anything unusual. Past the sixth, every further page came back
 * 429.
 *
 * The failure was silent and sticky. `EventSource` only auto-reconnects when the
 * server closes a stream that was already open; per the HTML spec a non-200
 * response such as 429 fails the connection outright and the browser does not
 * retry. So the seventh page view turned live updates off for that tab and left
 * them off, with nothing on screen to say so — the page looked correct and simply
 * stopped reflecting an editor's changes. A refresh usually did not fix it
 * either, because the window still had budget left to burn.
 *
 * Raising the ceiling does not weaken the protection that matters, because this
 * counter was never what stood between an attacker and the server. The
 * concurrent cap in the broadcaster is: `MAX_CLIENTS` in
 * `realtime-transport/sse.ts`, which counts connections actually held open —
 * precisely the resource this endpoint spends — and still refuses with a 503.
 * That one is covered by `realtime-client-cap.test.ts`.
 *
 * What remains here is an attempts-per-window brake on connect/disconnect churn,
 * which a concurrent cap does not cover. It is deliberately the looser of the
 * two controls: it should never be the one that turns away a real visitor.
 *
 * Per-IP is still the wrong instrument for a shared address — an office behind
 * one NAT, or a mobile carrier collapsing many subscribers into a single IP —
 * and no value of this constant fixes that.
 */
const CONNECTIONS_PER_IP = 30;
const CONNECT_WINDOW_MS = 60_000;

export async function GET(req: Request) {
  // When Supabase Broadcast is the selected transport, nothing subscribes here.
  // 204 is deliberate: the browser spec says EventSource stops reconnecting on
  // 204, whereas a 503 would make it retry against a server that will never
  // deliver. Left serving, every open tab would hold a connection open for ever
  // receiving nothing.
  if (!streamBackendActive()) {
    return new Response(null, { status: 204 });
  }

  const limit = rateLimit(`sse:${clientIp(req)}`, CONNECTIONS_PER_IP, CONNECT_WINDOW_MS);
  if (!limit.ok) {
    return new Response("Too many live-update connections from this address.", {
      status: 429,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Retry-After": String(limit.retryAfterSeconds),
      },
    });
  }

  const version = getRealtimeVersion();
  let refused = false;

  let clientRef: ReturnType<typeof addRealtimeClient> = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      clientRef = addRealtimeClient(controller);

      if (!clientRef) {
        // Ceiling reached. Close immediately so the browser's EventSource gives
        // up rather than reconnecting in a tight loop against a full server.
        refused = true;
        console.error(
          `[realtime] refused an SSE connection: already at the ${realtimeClientCount()} client ceiling`
        );
        controller.close();
        return;
      }

      const encoder = new TextEncoder();

      // Send initial hello + version
      const hello = `event: hello\ndata: ${JSON.stringify({ type: "hello", version, at: new Date().toISOString() })}\n\n`;
      try {
        controller.enqueue(encoder.encode(hello));
      } catch {
        /* ignore */
      }

      // Heartbeat every 25s to keep connection alive and proxies happy
      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: heartbeat ${Date.now()}\n\n`));
        } catch {
          if (heartbeat) clearInterval(heartbeat);
          if (clientRef) removeRealtimeClient(clientRef);
        }
      }, 25000);
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      if (clientRef) removeRealtimeClient(clientRef);
    },
  });

  if (refused) {
    return new Response("Too many live-update connections.", {
      status: 503,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Retry-After": "60",
      },
    });
  }

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}