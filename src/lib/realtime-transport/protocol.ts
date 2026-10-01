/**
 * The realtime transport contract.
 *
 * Two very different mechanisms sit behind this interface:
 *
 *   `sse`       an in-process broadcaster that fans out to EventSource clients
 *               connected to this Next.js server. Works on one process, dies with
 *               it, and cannot reach a second instance.
 *   `supabase`  Supabase Realtime Broadcast over a websocket. Reaches every
 *               connected client regardless of which process handled the write.
 *
 * The split matters because the SSE model is the one thing in this codebase that
 * does not survive a horizontal deployment: two instances each hold their own
 * subscriber Set, so an admin saving on instance A never notifies a visitor
 * attached to instance B. Nothing breaks visibly — updates just arrive on the
 * poll timer instead — which is why it survived the move to the target stack.
 */

/** Wire format for an update. Deliberately content-free — see `assertSafeToBroadcast`. */
export type RealtimeUpdate = {
  /**
   * Names of the collections that changed, e.g. ["hero"].
   *
   * This is the only field a client acts on. A payload naming collections tells
   * a listener "re-fetch the things you already had permission to see" and
   * carries nothing a client did not already have.
   */
  collections?: string[];
  /** Monotonic marker, so a client can tell a fresh update from a replay. */
  version?: number;
  at?: string;
};

/**
 * What a caller may pass to a publish.
 *
 * Deliberately wider than the wire format. Callers legitimately want to attach
 * diagnostics (`source`, `publishedBy`) for their own logging, and the SSE
 * backend — which fans out same-origin, to connections this server already
 * authenticated — can forward those without widening anything.
 *
 * The `supabase` backend reduces the same input through `assertSafeToBroadcast`
 * before it reaches a public topic. Keeping the two levels as separate types is
 * what makes that strip visible in review: a field added to the call site is not
 * silently broadcast, it is dropped, and `wireFieldNames` documents the boundary.
 */
export type RealtimeUpdateInput = RealtimeUpdate & Record<string, unknown>;

export type RealtimeBackendName = "sse" | "supabase";

/**
 * The Realtime Broadcast topic name, shared by the server publisher and the
 * browser subscriber.
 *
 * Lives here rather than being repeated, because a mismatch fails in the least
 * obvious way available: the server reports success, every client stays
 * connected, and updates simply never arrive. Both sides import it explicitly
 * from `@/lib/realtime/protocol` — note that `@/lib/realtime` itself resolves to
 * the sibling `src/lib/realtime.ts` (the React hook), not to this directory.
 */
export const REALTIME_TOPIC = "kc_realtime";

/** Broadcast event name carrying a collection update. */
export const REALTIME_UPDATE_EVENT = "update";

export interface RealtimePublisher {
  readonly name: RealtimeBackendName;

  /**
   * Whether this backend can actually deliver right now.
   *
   * Configured rather than usable: a backend that is wired up but whose remote
   * is unreachable still reports true here, and fails loudly at publish time.
   * The distinction is what lets `realtimeStatus` tell an operator "you have not
   * set the variables" separately from "they are set and the network is down".
   */
  configured(): boolean;

  /**
   * Deliver an update to every connected subscriber.
   *
   * Resolves rather than throws. A realtime delivery failure must never be
   * allowed to fail the write that triggered it: the row is already committed,
   * and reporting the save as failed would tell the admin their content was lost
   * when it was not. Clients fall back to the poll timer, so a dropped broadcast
   * costs freshness and nothing else.
   */
  publishUpdate(update: RealtimeUpdateInput): Promise<void>;

  /**
   * Subscribers currently held by this process. Diagnostic only — zero for
   * backends that do not track connections locally.
   */
  clientCount(): number;
}

/**
 * Fields permitted on the wire.
 *
 * The `supabase` backend publishes to a *public* Realtime channel, because the
 * application does not use Supabase Auth yet and private channels require an RLS
 * policy on `realtime.messages` tied to a Supabase JWT. A public channel means
 * any holder of the anon key can both read and send.
 *
 * That is acceptable only while the payload stays content-free. A collection
 * name tells a listener to re-fetch through the ordinary authorized API; the
 * admin's name that used to travel in `publishedBy` is personal data, and no
 * client ever read it. So the strip is a security control, not a tidy-up: it
 * makes "someone added a field to the publish call" fail loudly here rather than
 * quietly broadcast it to anyone who can reach the anon key.
 *
 * When Supabase Auth lands, make the channel private and keep this strip — the
 * two controls are independent.
 */
const ALLOWED_WIRE_FIELDS = ["collections", "version", "at"] as const;

/**
 * Reduce a caller-supplied update to the fields that are safe to broadcast.
 *
 * Takes the wider input type and returns the strict wire type, so the compiler
 * itself records that extras were allowed in and deliberately left out.
 *
 * Returns a fresh object rather than mutating, because the caller keeps using the
 * original for its own bookkeeping.
 */
export function assertSafeToBroadcast(update: RealtimeUpdateInput): RealtimeUpdate {
  const safe: RealtimeUpdate = {};

  if (Array.isArray(update.collections)) {
    // Only non-empty strings survive. A caller passing something odd is a bug,
    // and forwarding it would put unserialisable data on a public channel.
    safe.collections = update.collections.filter(
      (c): c is string => typeof c === "string" && c.length > 0 && c.length <= 64
    );
  }
  if (typeof update.version === "number") safe.version = update.version;
  if (typeof update.at === "string") safe.at = update.at;

  return safe;
}

export function wireFieldNames(): readonly string[] {
  return ALLOWED_WIRE_FIELDS;
}