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
const CONNECTIONS_PER_IP = 6;
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