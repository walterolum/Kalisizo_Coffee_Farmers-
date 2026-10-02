import { localUploadsEnabled } from "@/backend/upload-storage";
import type { StorageBackend, StorageBackendName } from "@/shared/storage/types";
import { localBackend } from "./local";
import { cloudinaryBackend, cloudinaryConfigured } from "./cloudinary";
import {
  supabaseStorageBackend,
  supabaseStorageConfigured,
} from "./supabase";

export * from "@/shared/storage/types";
export { localBackend } from "./local";
export { cloudinaryBackend, readCloudinaryConfig } from "./cloudinary";
export {
  supabaseStorageBackend,
  readSupabaseStorageConfig,
  supabaseStorageConfigured,
} from "./supabase";

/**
 * Chooses the storage backend from the environment.
 *
 * Precedence is explicit rather than "whichever variables happen to be set",
 * because two backends configured at once used to be resolved by whichever branch
 * came first in the route handler — an operator who added the new variables
 * without removing the old ones got Cloudinary and no indication why.
 *
 * `STORAGE_BACKEND` pins the choice. Without it the order below applies. Setting
 * it to a backend that is not configured is a hard error rather than a silent
 * fallback: a typo in a variable name should stop the upload, not quietly send
 * media somewhere the operator did not intend.
 */
export type BackendPreference = StorageBackendName | "auto";

export function preferredBackend(): BackendPreference {
  const raw = process.env.STORAGE_BACKEND?.trim().toLowerCase();
  if (!raw || raw === "auto") return "auto";
  if (raw === "local" || raw === "cloudinary" || raw === "supabase") return raw;
  return "auto";
}

/** The backends that are configured right now, in precedence order. */
export function availableBackends(): StorageBackend[] {
  const backends: StorageBackend[] = [];
  if (supabaseStorageConfigured()) backends.push(supabaseStorageBackend);
  if (cloudinaryConfigured()) backends.push(cloudinaryBackend);
  // Local disk is only a candidate where it can actually persist: development
  // always, production only when explicitly allowed.
  if (localUploadsEnabled()) backends.push(localBackend);
  return backends;
}

/**
 * The backend to use, or null when none is usable.
 *
 * Null is a legitimate answer and the upload route has to handle it: a fresh
 * deployment with no storage variables should return a clear 503 naming what to
 * set, not fail somewhere inside a write.
 */
export function getStorageBackend(): StorageBackend | null {
  const preferred = preferredBackend();

  if (preferred !== "auto") {
    const backend = availableBackends().find((b) => b.name === preferred);
    if (backend) return backend;
    return null;
  }

  return availableBackends()[0] ?? null;
}

export type StorageStatus = {
  /** True when at least one backend can accept an upload. */
  available: boolean;
  /** What `getStorageBackend` would pick. */
  selected: StorageBackendName | null;
  preference: BackendPreference;
  configured: StorageBackendName[];
  /** Set when a preference was pinned but is not usable. */
  problem?: string;
};

/**
 * Describes the current storage configuration.
 *
 * Used by the admin panel and by deployment checks. Reports the *problem* when a
 * pinned backend is unusable, because "uploads are broken" and "you set
 * STORAGE_BACKEND=supabase but SUPABASE_URL is missing" need very different
 * responses.
 */
export function storageStatus(): StorageStatus {
  const preference = preferredBackend();
  const configuredBackends = availableBackends().map((b) => b.name);
  const selected = getStorageBackend();

  const status: StorageStatus = {
    available: selected !== null,
    selected: selected?.name ?? null,
    preference,
    configured: configuredBackends,
  };

  if (preference !== "auto" && !configuredBackends.includes(preference)) {
    status.problem =
      `STORAGE_BACKEND=${preference} was requested but that backend is not configured` +
      (preference === "local"
        ? ". Local disk needs a persistent filesystem and, in production, ALLOW_LOCAL_UPLOADS=true."
        : `. Check the ${preference.toUpperCase()}_* environment variables.`);
  } else if (configuredBackends.length > 1) {
    // Worth surfacing even though it is not fatal: the choice is implicit.
    status.problem =
      `Several backends are configured (${configuredBackends.join(", ")}). ` +
      `Pinning STORAGE_BACKEND makes the choice explicit; "${selected?.name}" is being used.`;
  }

  return status;
}