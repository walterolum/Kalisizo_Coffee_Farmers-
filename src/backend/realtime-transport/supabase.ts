/**
 * Supabase Realtime Broadcast publisher.
 *
 * WHY HTTP AND NOT A SERVER-SIDE WEBSOCKET
 *
 * The obvious implementation is `supabase.channel(topic).subscribe().then(send)`,
 * which means holding a websocket open inside a Next.js route handler. That is
 * the wrong shape here for three reasons: the handler returns as soon as the
 * write completes, and on Vercel anything still in flight when the response is
 * sent can be frozen mid-flight, so broadcasts get dropped under exactly the
 * load that matters; the connection would have to be re-established per request
 * anyway, since nothing guarantees one process lives long enough to keep it; and
 * a socket per invocation is a resource the platform will start rejecting.
 *
 * Supabase's HTTP broadcast endpoint delivers the same message to every
 * subscriber of the topic without the caller holding a connection at all, so
 * this behaves identically from the client's point of view and costs one POST.
 *
 * WHY BROADCAST AND NOT postgres_changes
 *
 * `postgres_changes` would be a better fit if the application were the only
 * consumer: the database itself pushes row changes and the client subscribes to
 * tables. Two things rule it out here.
 *
 * First, it evaluates row security as the subscribing role. The application uses
 * its own JWT rather than Supabase Auth, so a subscriber is `anon` — and the RLS
 * policy set in migration 20261002000000 deliberately denies `anon` everything.
 * Making `postgres_changes` work would mean loosening that policy, which is
 * exactly the trade this project refused.
 *
 * Second, publishing here happens *after* an authorized write, so the app is
 * already the authorization boundary. Broadcast keeps it that way: the message
 * says "something changed", and the client re-fetches through the ordinary
 * API with the ordinary guards.
 */
import {
  REALTIME_TOPIC,
  REALTIME_UPDATE_EVENT,
  assertSafeToBroadcast,
} from "@/shared/realtime-transport/protocol";
import type {
  RealtimeBackendName,
  RealtimePublisher,
  RealtimeUpdateInput,
} from "@/shared/realtime-transport/protocol";

export type SupabaseRealtimeConfig = {
  url: string;
  /** Service role key — server only, never exposed to a browser. */
  serviceRoleKey: string;
};

/**
 * Read the server-side configuration.
 *
 * Returns null when incomplete rather than throwing, so `realtimeStatus` can
 * report *which* variable is missing. A publisher that threw on construction
 * would take down every route that merely imports it.
 */
export function readSupabaseRealtimeConfig(): SupabaseRealtimeConfig | null {
  const url = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) return null;
  return { url: url.replace(/\/+$/, ""), serviceRoleKey };
}

export function supabaseRealtimeConfigured(): boolean {
  return readSupabaseRealtimeConfig() !== null;
}

/**
 * How long to wait for the broadcast POST before giving up.
 *
 * Short on purpose. The broadcast is a freshness optimisation layered on top of
 * the client's poll timer: if it has not landed by the time the next poll is
 * due, the client picks the change up anyway. Waiting longer would hold a
 * response open to improve something nobody is waiting on.
 */
const BROADCAST_TIMEOUT_MS = 3_000;

export const supabasePublisher: RealtimePublisher = {
  name: "supabase" as RealtimeBackendName,

  configured(): boolean {
    return supabaseRealtimeConfigured();
  },

  async publishUpdate(update: RealtimeUpdateInput): Promise<void> {
    const config = readSupabaseRealtimeConfig();
    if (!config) {
      console.error(
        "[realtime] supabase backend selected but SUPABASE_URL or " +
          "SUPABASE_SERVICE_ROLE_KEY is missing; update was not delivered"
      );
      return;
    }

    const payload = assertSafeToBroadcast(update);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), BROADCAST_TIMEOUT_MS);
    try {
      const response = await fetch(`${config.url}/realtime/v1/api/broadcast`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          apikey: config.serviceRoleKey,
          Authorization: `Bearer ${config.serviceRoleKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [
            {
              topic: REALTIME_TOPIC,
              event: REALTIME_UPDATE_EVENT,
              payload,
            },
          ],
        }),
      });

      if (!response.ok) {
        // The body can name the topic or the policy, so include it — but truncate,
        // since it is a remote service's response and not ours to log at length.
        const detail = await response.text().catch(() => "");
        console.error(
          `[realtime] supabase broadcast failed: ${response.status}` +
            (detail ? ` - ${detail.slice(0, 300)}` : "")
        );
      }
    } catch (error) {
      // Never propagated: the write that triggered this has already committed and
      // succeeded. Failing the request now would tell the admin their content
      // was lost when it is sitting in the database.
      console.error(
        "[realtime] supabase broadcast did not complete:",
        error instanceof Error ? error.message : error
      );
    } finally {
      clearTimeout(timeout);
    }
  },

  clientCount(): number {
    // Connections are held by the browser and by Supabase's own edge, not by
    // this process, so there is nothing local to report.
    return 0;
  },
};