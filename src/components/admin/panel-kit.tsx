"use client";

/**
 * Shared plumbing for the CMS panels.
 *
 * This module exists because `AdminClient.tsx` grew past three thousand lines and
 * had become the single place where the session token, the form control styles
 * and the panel chrome were defined. Moving them here is a pure relocation: no
 * behaviour changed, which is the point — the panels could only be extracted once
 * they no longer each depended on something private to that file.
 *
 * Two client API layers still coexist. `@/lib/admin-api` is the typed one used by
 * the panels that have already been rewritten; `apiFetch` below is the older one
 * the remaining panels use. They were deliberately not merged: `admin-api.ts`
 * raises the session-expired event that `AdminClient` listens for, and folding
 * `apiFetch` into it would have made the two import each other.
 */
import { useState, type ReactNode } from "react";
import { Loader2, UploadCloud } from "lucide-react";
import { notifyRealtimeUpdate } from "@/lib/realtime";
import { saveOutcome, type SaveResult } from "@/lib/save-outcome";
import {
  AdminApiError,
  notifySessionExpired,
  TOKEN_KEY as ADMIN_TOKEN_KEY,
} from "@/lib/admin-api";

/**
 * Re-exported rather than redeclared: both client API layers must read and clear
 * the same key, and two literals is how "logged out but still authenticated"
 * happens.
 */
export const TOKEN_KEY = ADMIN_TOKEN_KEY;
export const USER_KEY = "kc_admin_user";

/**
 * Extends `AdminApiError` so a single `instanceof AdminApiError` check covers
 * failures from either layer. The two classes used to be unrelated, so a panel
 * only recognised 401s raised by its own helper — see the note on
 * `AdminApiError` in `@/lib/admin-api`.
 */
export class ApiError extends AdminApiError {
  constructor(status: number, message: string) {
    super(message, status);
    this.name = "ApiError";
  }
}

/**
 * Fetches JSON with the admin bearer token attached.
 *
 * GETs are cache-busted because the panels must see their own writes immediately
 * rather than after a revalidation, and a successful mutation nudges connected
 * clients so open public tabs refresh.
 */
export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token =
    typeof window === "undefined" ? null : localStorage.getItem(TOKEN_KEY);
  const method = (init.method ?? "GET").toUpperCase();
  const isMutatingAdmin =
    path.startsWith("/api/v1/admin") &&
    ["POST", "PUT", "PATCH", "DELETE"].includes(method) &&
    !path.includes("/login");
  const isGet = method === "GET";
  const bust = isGet
    ? path.includes("?")
      ? `&_t=${Date.now()}`
      : `?_t=${Date.now()}`
    : "";
  const url = isGet ? `${path}${bust}` : path;
  const res = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.message) message = body.message;
    } catch {
      /* keep fallback message */
    }
    // Clear the session and raise the event before throwing. Without this the
    // shell never learns the token died, and the administrator is left looking at
    // a normal CMS whose every request fails.
    if (res.status === 401) notifySessionExpired();
    throw new ApiError(res.status, message);
  }
  if (isMutatingAdmin) {
    try {
      notifyRealtimeUpdate();
    } catch {
      /* ignore */
    }
  }
  return res.json() as Promise<T>;
}

/* ---------------------------------------------------------------- form helpers */

export const inputBase =
  "w-full rounded-xl border border-white/15 bg-forest/80 px-3.5 py-2.5 text-sm text-cream placeholder:text-cream/55 outline-none transition-colors focus:border-gold focus:ring-2 focus:ring-gold/20";

export const labelBase =
  "text-xs font-bold uppercase tracking-wider text-cream/60";

/**
 * Label wrapper used by the panels still on the older bespoke form helpers.
 * `hint` is optional and only used where the choice needs explaining.
 */
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className={labelBase}>{label}</span>
      {children}
      {hint ? (
        <span className="text-[12px] leading-relaxed text-cream/45">
          {hint}
        </span>
      ) : null}
    </label>
  );
}

export function Panel({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-white/[0.04] p-6 ring-1 ring-white/10">
      <h2 className="flex items-center gap-2.5 font-display text-lg font-semibold text-cream">
        <span className="text-gold-light">{icon}</span>
        {title}
      </h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

/** Comma-separated form input -> string list, for fields shown as one line. */
export function splitList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

/** Newline-separated textarea -> string list, for fields shown one per line. */
export function splitLines(value: string): string[] {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

/* ------------------------------------------------------------ option lists */

/**
 * Option lists shared by the home-page module panels. They live here rather than
 * in any one panel because the public site renders the same keys, and a list that
 * exists in two places is a list that will eventually disagree.
 */

export const LEADER_ICON_OPTIONS = [
  "crown",
  "briefcase",
  "wallet",
  "file",
  "users",
];

export const PRODUCT_ICON_OPTIONS = [
  "coffee",
  "flask",
  "sprout",
  "leaf",
  "recycle",
  "piggybank",
  "landmark",
  "users",
  "wheat",
];

export const PRODUCT_CATEGORIES = [
  "COFFEE_BEANS",
  "FERTILIZER_INPUTS",
  "EQUIPMENT",
  "SACCO_PRODUCT",
];

export const GRADIENT_OPTIONS = [
  "from-[#d5a83d] to-[#a87a1d]",
  "from-[#1f7345] to-[#0e3d28]",
  "from-[#4a2c11] to-[#6b3f1a]",
  "from-[#0e3d28] to-[#1f7345]",
  "from-[#a87a1d] to-[#d5a83d]",
  "from-[#0e3d28] to-[#0f6b40]",
];

export const HERO_TODAY_ICON_OPTIONS = [
  "coffee",
  "sprout",
  "piggybank",
  "graduationcap",
  "landmark",
  "leaf",
  "users",
  "handshake",
];

/* ----------------------------------------------------------------- uploads */

/**
 * Image upload control.
 *
 * Posts to `/api/v1/admin/upload`, which verifies the file's magic bytes rather
 * than trusting the extension or the browser's content type, so the accept list
 * here is a convenience for the picker and not the security boundary.
 */
export function UploadButton({
  onUploaded,
  label = "Upload image",
}: {
  onUploaded: (url: string) => void;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const token = localStorage.getItem(TOKEN_KEY);
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/v1/admin/upload", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body?.message ?? "Upload failed");
        return;
      }
      onUploaded(body.url as string);
    } catch {
      setError("Upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label className="inline-flex cursor-pointer items-center gap-2 self-start rounded-xl bg-white/5 px-3 py-2 text-xs font-semibold text-cream/80 ring-1 ring-white/10 transition-colors hover:bg-white/10 focus-within:ring-2 focus-within:ring-gold">
        {busy ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <UploadCloud className="size-3.5" aria-hidden="true" />
        )}
        {busy ? "Uploading…" : label}
        {/* `sr-only`, never `hidden`.

            `hidden` is `display:none`, which removes the input from the tab order
            and the accessibility tree entirely, and a `<label>` is not focusable
            and has no keyboard activation of its own. That combination looked
            fine to a mouse user and made uploading an image impossible for anyone
            driving the CMS from the keyboard — the file picker could not be
            opened at all.

            Visually hidden keeps the input focusable and keeps this label as its
            accessible name. `focus-within` on the label then paints the focus ring
            on the visible control, because the focused element itself is invisible. */}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={pick}
          className="sr-only"
        />
      </label>
      {error && (
        <span className="text-xs font-semibold text-red-300">{error}</span>
      )}
    </div>
  );
}

/* -------------------------------------------------------------- save feedback */

/**
 * Single save flow used by every bespoke content panel:
 * 1. clear loading + disable the button (caller sets `saving`)
 * 2. call the API; the server validates + persists to the DB first
 * 3. report what the server actually stored, never an assumed outcome
 * 4. on failure, say plainly that nothing was saved
 */
export async function publishAndFeedback(
  notify: (message: string, kind?: "success" | "error") => void,
  onSessionError: (error: unknown) => void,
  action: () => Promise<SaveResult>,
): Promise<boolean> {
  try {
    const res = await action();
    const outcome = saveOutcome(res);
    notify(outcome.message, outcome.kind);
    return true;
  } catch (error) {
    onSessionError(error);
    notify(
      error instanceof Error
        ? `Not saved: ${error.message}`
        : "Not saved. Try again.",
      "error",
    );
    return false;
  }
}
