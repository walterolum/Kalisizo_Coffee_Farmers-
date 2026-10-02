import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { contentTypeFor } from "@/backend/upload-storage";
import {
  StorageError,
  type GetResult,
  type PutInput,
  type StorageBackend,
  type StoredObject,
} from "@/shared/storage/types";

/**
 * Supabase Storage.
 *
 * Chosen over local disk because a serverless filesystem is ephemeral: an object
 * written during one invocation is simply gone after the next cold start. It is
 * chosen over Cloudinary because it keeps media, database and authentication
 * behind one vendor and one set of credentials to revoke.
 *
 * The service-role key is read here and never leaves the server: this module is
 * imported only from route handlers and scripts, and the bucket itself is
 * configured separately (see `scripts/setup-supabase-storage.ts`), which is what
 * actually decides who may read objects.
 *
 * Objects are served from a **public** bucket by URL. That matches the existing
 * behaviour — the CMS stores a URL and renders it directly in `next/image`, so a
 * signed URL that expires would break every stored reference. Anything that must
 * not be world-readable belongs in the private bucket instead, which this
 * adapter deliberately does not handle: it would need per-request signing and a
 * decision about what happens to already-stored URLs.
 */

/** Metadata recorded on an object. Never interpreted as a path. */
const FOLDER_METADATA = "folder";

export type SupabaseStorageConfig = {
  url: string;
  serviceRoleKey: string;
  bucket: string;
};

let cached: SupabaseClient | null = null;
let cachedKey = "";

/**
 * Reads and validates the configuration, without creating a client.
 *
 * Split from `getSupabaseStorage` so configuration errors can be reported
 * precisely at startup or in the admin panel, rather than as a confusing failure
 * inside the first upload.
 */
export function readSupabaseStorageConfig(): SupabaseStorageConfig | null {
  const url = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const bucket = process.env.SUPABASE_STORAGE_BUCKET?.trim() || "cms-media";

  if (!url || !serviceRoleKey) return null;

  return { url, serviceRoleKey, bucket };
}

export function supabaseStorageConfigured(): boolean {
  return readSupabaseStorageConfig() !== null;
}

function getSupabaseStorage(): { client: SupabaseClient; bucket: string } {
  const config = readSupabaseStorageConfig();
  if (!config) {
    throw new StorageError(
      "Supabase Storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  // Cached per credential so the hot path does not rebuild a client per upload.
  if (cached && cachedKey === config.serviceRoleKey) {
    return { client: cached, bucket: config.bucket };
  }

  const client = createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  cached = client;
  cachedKey = config.serviceRoleKey;
  return { client, bucket: config.bucket };
}

/**
 * Builds the public URL for an object in a bucket.
 *
 * Kept in step with Supabase's published bucket layout rather than asking the SDK
 * for it, because the CMS persists these URLs as durable data. If this ever
 * needs to change it has to change as a data migration, not a code change.
 */
export function supabasePublicUrl(key: string, config?: SupabaseStorageConfig): string {
  const resolved = config ?? readSupabaseStorageConfig();
  if (!resolved) return "";
  return `${resolved.url.replace(/\/+$/, "")}/storage/v1/object/public/${resolved.bucket}/${encodePath(key)}`;
}

/**
 * Percent-encodes each path segment but keeps the separators.
 *
 * `encodeURIComponent` alone would escape `/` and turn a nested key into one
 * long segment, which Supabase would then not find.
 */
function encodePath(key: string): string {
  return key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export const supabaseStorageBackend: StorageBackend = {
  name: "supabase",

  async put({ key, body, contentType, folder }: PutInput): Promise<StoredObject> {
    const { client, bucket } = getSupabaseStorage();

    // `upsert: false` so a key collision raises an error instead of replacing an
    // existing object. Matches the local backend's `wx` behaviour.
    const { error } = await client.storage.from(bucket).upload(key, body, {
      contentType,
      cacheControl: "31536000",
      upsert: false,
      ...(folder ? { metadata: { [FOLDER_METADATA]: folder } } : {}),
    });

    if (error) {
      throw new StorageError(`Could not upload to Supabase Storage: ${error.message}`, error);
    }

    return { key, url: supabasePublicUrl(key) };
  },

  async get(key: string): Promise<GetResult | null> {
    const { client, bucket } = getSupabaseStorage();

    const { data, error } = await client.storage.from(bucket).download(key);
    if (error || !data) return null;

    return {
      body: data.stream() as ReadableStream<Uint8Array>,
      // From the shared fixed table, not from Supabase's stored metadata and not
      // from the blob's own type: a previously uploaded object must not be able
      // to declare its own content type.
      contentType: contentTypeFor(key) ?? "application/octet-stream",
      // `download` already returns a Blob, so the size is free. There is no
      // per-object `getInfo` in the SDK's file API, and a second request to
      // `list()` just to recover metadata would double the latency of serving.
      size: data.size,
    };
  },

  async remove(key: string): Promise<void> {
    const { client, bucket } = getSupabaseStorage();
    const { error } = await client.storage.from(bucket).remove([key]);
    if (error) {
      // Removing an object that is not there is reported by Supabase as an
      // error; the contract says that is success.
      if (/not found|does not exist/i.test(error.message)) return;
      throw new StorageError(`Could not remove the object from Supabase Storage: ${error.message}`, error);
    }
  },
};

/** Test seam: forces the next call to rebuild the client from the environment. */
export function __resetSupabaseClientCache(): void {
  cached = null;
  cachedKey = "";
}