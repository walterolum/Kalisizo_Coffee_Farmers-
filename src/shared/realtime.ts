"use client";

import { useEffect, useRef } from "react";
// Shared with the server publisher so the topic cannot drift. Note that this is a
// different channel from REALTIME_CHANNEL below: that one is a same-browser
// BroadcastChannel used to sync tabs on this device, while REALTIME_TOPIC is the
// Supabase Realtime topic. They happen to share a name and are unrelated.
import { REALTIME_TOPIC, REALTIME_UPDATE_EVENT } from "@/shared/realtime-transport/protocol";

export const REALTIME_TICK_KEY = "kc_realtime_tick";
export const REALTIME_CHANNEL = "kc_realtime";
export const REALTIME_EVENT = "kc:update";
export const REALTIME_INTERVAL_MS = 4000;
export const REALTIME_SSE_URL = "/api/v1/realtime/stream";

/**
 * Broadcast a realtime tick to all open tabs/windows.
 * Call this from admin after any successful create/update/delete.
 * Public pages poll every REALTIME_INTERVAL_MS and also listen for this tick for instant (<300ms) update.
 *
 * Note: the admin mutation API already broadcasts to every connected client over SSE
 * (src/backend/publish.ts -> broadcastRealtimeUpdate), so no server round-trip is needed here.
 */
export function notifyRealtimeUpdate(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(REALTIME_TICK_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
  try {
    const bc = new BroadcastChannel(REALTIME_CHANNEL);
    bc.postMessage({ type: "update", at: Date.now() });
    bc.close();
  } catch {
    /* BroadcastChannel not available */
  }
  try {
    window.dispatchEvent(new CustomEvent(REALTIME_EVENT));
  } catch {
    /* ignore */
  }
}

/*
 * ---------------------------------------------------------------------------
 * Shared transport
 * ---------------------------------------------------------------------------
 *
 * Every one of these listeners used to open its OWN EventSource. Roughly fifteen
 * components call useRealtimePoll, so a single page opened fifteen SSE streams
 * that never close. Browsers allow only six concurrent connections per origin
 * over HTTP/1.1 — which is what `next start` speaks — so the pool was
 * permanently saturated. Every later request (script chunks, the polls
 * themselves, form posts) queued forever, leaving a page that rendered fine
 * from server HTML but ignored every click.
 *
 * The stream and the poll timer are now process-wide singletons, ref-counted
 * against the number of live subscribers, and each subscriber just registers a
 * callback. Fifteen subscriptions cost one connection and one timer.
 */

type Listener = {
  collection?: string;
  fn: () => void;
  /**
   * Minimum gap between *timer* ticks for this subscriber.
   *
   * The timer is the only unconditional trigger — SSE pushes, focus, visibility
   * and cross-tab ticks are all event-driven and rare. A subscriber that issues
   * several rate-limited requests per run therefore has to be able to say "not
   * more often than this", or it exhausts its own budget while sitting idle on
   * screen. Without this the admin dashboard, which loads nine resources every
   * tick, burned through a 120-per-15-minute bucket in about eight minutes and
   * then rendered an error page for the rest of the window.
   */
  minIntervalMs?: number;
  /** When this subscriber last ran from a timer tick, for the cooldown check. */
  lastTickAt?: number;
};

const listeners = new Set<Listener>();

let source: EventSource | null = null;
let unsubscribeSupabase: (() => void) | null = null;
let timer: number | null = null;
let intervalMs = REALTIME_INTERVAL_MS;
let globalsAttached = false;
let channel: BroadcastChannel | null = null;

function safeCall(fn: () => void): void {
  try {
    fn();
  } catch {
    /* a failing subscriber must not stop the others */
  }
}

/**
 * Fire subscribers. An SSE payload naming collections only wakes the matching
 * ones; every other trigger (poll, focus, visibility, cross-tab) wakes all of
 * them as a safety net.
 */
function emit(collections?: string[]): void {
  for (const listener of Array.from(listeners)) {
    if (
      collections &&
      listener.collection &&
      !collections.includes(listener.collection)
    ) {
      continue;
    }
    safeCall(listener.fn);
  }
}

/**
 * A timer tick wakes every component at once. Stagger the requests slightly so a
 * tick does not fire fifteen simultaneous fetches at the server, and honour each
 * subscriber's `minIntervalMs` cooldown.
 *
 * The cooldown is checked here and *not* in `emit`, deliberately. `emit` is the
 * path an SSE push travels, and a push means someone genuinely changed something:
 * skipping it because the last refresh was twelve seconds ago would defeat the
 * live-update feature. Only the unconditional timer is throttled, which is
 * exactly the trigger that was costing the API its rate-limit budget.
 */
function emitStaggered(): void {
  let i = 0;
  const now = Date.now();
  for (const listener of Array.from(listeners)) {
    const cooldown =
      typeof listener.minIntervalMs === "number" &&
      typeof listener.lastTickAt === "number"
        ? listener.minIntervalMs
        : 0;
    if (cooldown > 0 && now - (listener.lastTickAt ?? 0) < cooldown) {
      // Still cooling down. Deliberately skipped — not deferred, because a
      // deferred run would re-enter this same skip logic on a timer of its own.
      continue;
    }
    listener.lastTickAt = now;

    const delay = i * 60;
    if (delay === 0) safeCall(listener.fn);
    else window.setTimeout(() => safeCall(listener.fn), delay);
    i += 1;
  }
}

function readCollections(data: string | undefined): string[] | undefined {
  try {
    const parsed = JSON.parse(data ?? "{}") as { collections?: unknown };
    if (Array.isArray(parsed.collections))
      return parsed.collections as string[];
  } catch {
    /* non-JSON payload; treat as generic */
  }
  return undefined;
}

function connect(): void {
  // One transport at a time, matching whichever the server publishes on. Running
  // both would double every wake-up and leave an SSE connection open that can
  // never receive anything.
  if (clientTransport() === "supabase") {
    if (!unsubscribeSupabase) unsubscribeSupabase = connectSupabase();
    return;
  }

  if (source) return;
  try {
    source = new EventSource(REALTIME_SSE_URL);
    source.addEventListener("update", (ev) => {
      emit(readCollections((ev as MessageEvent).data as string | undefined));
    });
    // hello also triggers a sync on connect
    source.addEventListener("hello", () => {
      // tiny debounce so initial hello doesn't double-fetch with mount
      window.setTimeout(emit, 150);
    });
    source.onerror = () => {
      // EventSource auto-reconnects; no action needed
    };
  } catch {
    source = null;
  }
}

function disconnect(): void {
  if (unsubscribeSupabase) {
    try {
      unsubscribeSupabase();
    } catch {
      /* ignore */
    }
    unsubscribeSupabase = null;
  }
  if (!source) return;
  try {
    source.close();
  } catch {
    /* ignore */
  }
  source = null;
}

function startTimer(): void {
  if (timer !== null) return;
  timer = window.setInterval(emitStaggered, intervalMs);
}

function stopTimer(): void {
  if (timer === null) return;
  window.clearInterval(timer);
  timer = null;
}

const onStorage = (e: StorageEvent) => {
  if (e.key === REALTIME_TICK_KEY) emit();
};

const onVisibility = () => {
  if (document.visibilityState === "visible") emit();
};

const onFocus = () => emit();

const onCustom = () => emit();

const onChannelMessage = () => emit();

function attachGlobals(): void {
  if (globalsAttached) return;
  globalsAttached = true;

  window.addEventListener("storage", onStorage);
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("focus", onFocus);
  window.addEventListener(REALTIME_EVENT, onCustom as EventListener);

  try {
    channel = new BroadcastChannel(REALTIME_CHANNEL);
    channel.onmessage = onChannelMessage;
  } catch {
    channel = null;
  }
}

function detachGlobals(): void {
  if (!globalsAttached) return;
  globalsAttached = false;

  window.removeEventListener("storage", onStorage);
  document.removeEventListener("visibilitychange", onVisibility);
  window.removeEventListener("focus", onFocus);
  window.removeEventListener(REALTIME_EVENT, onCustom as EventListener);

  if (channel) {
    try {
      channel.close();
    } catch {
      /* ignore */
    }
    channel = null;
  }
}

/**
 * Which transport the browser subscribes on.
 *
 * Must agree with the server's selection (see `realtimeStatus` on the server, and
 * `streamBackendActive`). Both sides read the same `REALTIME_BACKEND` variable, so
 * they cannot disagree — but a browser only ever sees its own `NEXT_PUBLIC_*`
 * variables, which is why a missing public URL falls back to SSE rather than
 * guessing.
 *
 * Served from public env on purpose: it is a URL and the anon key, both of which
 * are designed to be public. The service role key is never referenced here.
 */
function clientTransport(): "supabase" | "sse" {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && key) return "supabase";
  return "sse";
}

/**
 * Subscribe to Supabase Realtime Broadcast.
 *
 * Returns a teardown function. Supabase's client is created lazily and kept at
 * module scope: `createClient` opens a websocket, and building a new one per
 * subscriber would mean one socket per mounted component — the same connection
 * pile-up the shared SSE stream was built to avoid.
 */
function connectSupabase(): () => void {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

  let closed = false;

  void (async () => {
    try {
      const { createClient } = await import("@supabase/supabase-js");
      // No session is persisted or auto-refreshed: this client exists solely to
      // receive broadcast messages. Attaching the Supabase Auth session to it would
      // blur which credential is doing the subscribing, which matters once the
      // channel becomes private.
      const supabase = createClient(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        realtime: { params: { eventsPerSecond: 10 } },
      });

      const channel = supabase.channel(REALTIME_TOPIC);
      channel.on("broadcast", { event: REALTIME_UPDATE_EVENT }, (message) => {
        if (closed) return;
        const payload = message.payload as { collections?: unknown } | undefined;
        emit(readCollections(JSON.stringify(payload ?? {})));
      });
      channel.subscribe();
    } catch {
      // A failed subscription is not fatal: the poll timer, the focus and
      // visibility handlers, and the cross-tab channel all still run, so the
      // page stays correct and merely stops being instant.
    }
  })();

  return () => {
    closed = true;
  };
}

/**
 * Poll `callback` every `intervalMs` and also on:
 * - storage event (cross-tab localStorage tick)
 * - BroadcastChannel message
 * - CustomEvent `kc:update` (same-tab)
 * - document visibility change → visible
 * - window focus
 *
 * `callback` is stable via ref so caller can memoise without re-subscribing.
 *
 * `collection` opts into *targeted* updates: when the server broadcasts an "update"
 * naming specific collections (e.g. ["hero"]), only callbacks subscribed to a
 * matching collection re-run — other components stay untouched. All non-broadcast
 * triggers (poll, focus, cross-tab, etc.) always re-run as a safety net.
 *
 * `options.minIntervalMs` sets a floor on how often this subscriber may be woken
 * by the *timer*. It exists because `requestedIntervalMs` can only move the shared
 * timer one way — every subscriber races to make it faster, and nothing can ask for
 * slower. A view that issues several rate-limited requests per run therefore has no
 * way to stay inside its own budget except by not polling. Event-driven triggers
 * (broadcast, focus, cross-tab) are unaffected, so live updates still land
 * immediately.
 */
export function useRealtimePoll(
  callback: () => void,
  requestedIntervalMs: number = REALTIME_INTERVAL_MS,
  collection?: string,
  options?: { minIntervalMs?: number },
): void {
  const ref = useRef(callback);
  const collectionRef = useRef(collection);
  const listenerRef = useRef<Listener | null>(null);
  const minIntervalRef = useRef(options?.minIntervalMs);

  useEffect(() => {
    ref.current = callback;
  }, [callback]);

  useEffect(() => {
    collectionRef.current = collection;
  }, [collection]);

  // Mutate the live listener rather than resubscribing: re-running the subscribe
  // effect would tear down and rebuild the shared timer on every render in which
  // a caller passes a fresh options object.
  useEffect(() => {
    minIntervalRef.current = options?.minIntervalMs;
    if (listenerRef.current)
      listenerRef.current.minIntervalMs = options?.minIntervalMs;
  }, [options?.minIntervalMs]);

  useEffect(() => {
    const listener: Listener = {
      collection: collectionRef.current,
      fn: () => ref.current(),
      minIntervalMs: minIntervalRef.current,
    };
    listeners.add(listener);
    listenerRef.current = listener;

    // Honor the fastest requested interval if a caller asks for one, so a
    // shared timer never polls slower than a subscriber expects.
    if (requestedIntervalMs < intervalMs && typeof window !== "undefined") {
      intervalMs = requestedIntervalMs;
      if (timer !== null) {
        window.clearInterval(timer);
        timer = null;
      }
    }

    attachGlobals();
    connect();
    startTimer();

    return () => {
      listeners.delete(listener);
      if (listenerRef.current === listener) listenerRef.current = null;
      if (listeners.size === 0) {
        stopTimer();
        disconnect();
        detachGlobals();
        intervalMs = REALTIME_INTERVAL_MS;
      }
    };
  }, [requestedIntervalMs]);
}

/**
 * Helper to wrap any async loader for realtime polling:
 * usage: const load = useCallback(async () => { ... }, []); useRealtimeEffect(load, "hero");
 */
export function useRealtimeEffect(
  load: () => void,
  requestedIntervalMs?: number,
  collection?: string,
): void {
  useRealtimePoll(() => load(), requestedIntervalMs, collection);
}
