/**
 * Chooses the realtime transport from the environment.
 *
 * Same shape and same reasoning as the storage adapter in `../storage/index.ts`:
 * explicit precedence rather than "whichever variables happen to be set", and a
 * pinned backend that is not configured is a hard error rather than a silent
 * fallback.
 *
 * Silent fallback is the failure worth avoiding here. During a cutover the old
 * and new variables are both present by definition, so an implicit resolver
 * picks one arbitrarily and live updates keep *appearing* to work on whichever
 * instance happened to be chosen — while the other silently stops reaching its
 * subscribers. An operator has no signal. Pinning makes the choice visible.
 *
 * NOTE on module identity: this directory is `realtime-transport`, not
 * `realtime`, because `@/shared/realtime` already resolves to the React hook in
 * `src/shared/realtime.ts` and a same-named directory would be shadowed by it.
 * Server code enters through `@/backend/realtime-server`, which re-exports from here.
 */
import {
  supabasePublisher,
  supabaseRealtimeConfigured,
} from "./supabase";
import { ssePublisher } from "@/shared/realtime-transport/sse";
import type { RealtimeBackendName, RealtimePublisher } from "@/shared/realtime-transport/protocol";

export * from "@/shared/realtime-transport/protocol";
export {
  ssePublisher,
  sendRawSse,
  realtimeClientCount,
  getRealtimeVersion,
} from "@/shared/realtime-transport/sse";
export {
  supabasePublisher,
  supabaseRealtimeConfigured,
  readSupabaseRealtimeConfig,
} from "./supabase";

export type BackendPreference = RealtimeBackendName | "auto";

/**
 * Default when nothing is pinned.
 *
 * `sse`, not `supabase`. The in-process broadcaster needs no configuration and
 * works on a single instance, so it is the only backend that can be correct
 * without the operator having set anything up. Defaulting the other way would
 * make an unconfigured deployment quietly depend on network variables.
 */
const DEFAULT_BACKEND: RealtimeBackendName = "sse";

export function preferredBackend(): BackendPreference {
  const raw = process.env.REALTIME_BACKEND?.trim().toLowerCase();
  if (!raw || raw === "auto") return "auto";
  if (raw === "sse" || raw === "supabase") return raw;
  return "auto";
}

/** The backends that are configured right now, in precedence order. */
export function availableBackends(): RealtimePublisher[] {
  const backends: RealtimePublisher[] = [];
  if (supabaseRealtimeConfigured()) backends.push(supabasePublisher);
  // SSE needs no configuration, so it is always a candidate and always last:
  // an explicitly configured Supabase project should win over the fallback.
  backends.push(ssePublisher);
  return backends;
}

/**
 * The backend to publish through.
 *
 * Null is a legitimate answer only when a backend was pinned that is not
 * usable. Left null in that case, a publish is dropped with a logged reason
 * instead of silently going out over whichever transport happens to be nearest.
 */
export function getRealtimePublisher(): RealtimePublisher | null {
  const preferred = preferredBackend();

  if (preferred !== "auto") {
    return availableBackends().find((b) => b.name === preferred) ?? null;
  }

  return availableBackends()[0] ?? null;
}

export type RealtimeStatus = {
  /** True when some backend can accept a publish. */
  available: boolean;
  /** What `getRealtimePublisher` would pick. */
  selected: RealtimeBackendName | null;
  preference: BackendPreference;
  configured: RealtimeBackendName[];
  /** Whether clients subscribe via Supabase or via this server's SSE stream. */
  clientTransport: "supabase" | "sse";
  problem?: string;
};

/**
 * Describes the current realtime configuration.
 *
 * The distinction between "not configured" and "configured" is the whole reason
 * this exists: "live updates are slow" and "you pinned REALTIME_BACKEND=supabase
 * but SUPABASE_SERVICE_ROLE_KEY is missing" call for completely different
 * responses, and without this the second is indistinguishable from the first.
 */
export function realtimeStatus(): RealtimeStatus {
  const preference = preferredBackend();
  const configuredBackends = availableBackends().map((b) => b.name);
  const selected = getRealtimePublisher();

  const status: RealtimeStatus = {
    available: selected !== null,
    selected: selected?.name ?? null,
    preference,
    configured: configuredBackends,
    // Must agree with the selected backend: the browser has to subscribe wherever
    // the server publishes, and a mismatch presents as updates that never arrive
    // with no error on either side.
    clientTransport: selected?.name === "supabase" ? "supabase" : "sse",
  };

  if (preference !== "auto" && !configuredBackends.includes(preference)) {
    status.problem =
      `REALTIME_BACKEND=${preference} was requested but that backend is not configured` +
      (preference === "supabase"
        ? ". It needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the server, plus " +
          "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in the browser."
        : ". The SSE backend needs no configuration.");
  } else if (configuredBackends.includes("supabase") && selected?.name === "sse") {
    // Worth surfacing even though it is not fatal: the choice is implicit, and
    // this is precisely the state in which a cutover half-applies and looks fine.
    status.problem =
      "Supabase is configured but SSE was selected, so updates only reach clients " +
      "attached to this one process. Pinning REALTIME_BACKEND=supabase makes it explicit.";
  }

  return status;
}

export { DEFAULT_BACKEND };