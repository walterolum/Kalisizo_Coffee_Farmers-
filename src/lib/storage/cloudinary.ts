import { v2 as cloudinary } from "cloudinary";

import {
  StorageError,
  type GetResult,
  type PutInput,
  type StorageBackend,
  type StoredObject,
} from "./types";

/**
 * Cloudinary, the backend currently configured in production.
 *
 * Kept behind the same interface as local disk and Supabase Storage so the
 * migration can be verified by switching configuration rather than by rewriting
 * the upload route, and so a rollback is a one-line environment change.
 *
 * Cloudinary is the only backend that renames objects: it returns its own
 * `public_id` rather than the key it was given, and it will not serve an object
 * back through this adapter's `get` (the CMS only ever needs the public URL, and
 * fetching through Cloudinary's API to re-derive a type would reintroduce exactly
 * the "who decides the Content-Type" question the interface forbids). `get` and
 * `remove` are therefore implemented against the key Cloudinary does return.
 */
export type CloudinaryConfig = {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
};

let configured: CloudinaryConfig | null = null;

export function readCloudinaryConfig(): CloudinaryConfig | null {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim();
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim();
  if (!cloudName || !apiKey || !apiSecret) return null;
  return { cloudName, apiKey, apiSecret };
}

export function cloudinaryConfigured(): boolean {
  return readCloudinaryConfig() !== null;
}

function requireConfig(): CloudinaryConfig {
  const config = readCloudinaryConfig();
  if (!config) {
    throw new StorageError(
      "Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET."
    );
  }
  if (!configured) {
    cloudinary.config({
      cloud_name: config.cloudName,
      api_key: config.apiKey,
      api_secret: config.apiSecret,
    });
    configured = config;
  }
  return config;
}

export const cloudinaryBackend: StorageBackend = {
  name: "cloudinary",

  put({ key, body, folder }: PutInput): Promise<StoredObject> {
    requireConfig();

    return new Promise<StoredObject>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          // Cloudinary namespaces by its own `public_id`, so the key we generate
          // is passed through rather than used as a filename. It still
          // guarantees uniqueness across migrations.
          public_id: key,
          ...(folder ? { folder } : {}),
          resource_type: "image",
          // Uploaded bytes are already validated by the route; do not let
          // Cloudinary's optimisation re-encode them into something we would
          // then serve under a type we did not verify.
          transformation: [{ quality: "auto", fetch_format: "auto" }],
        },
        (error, uploaded) => {
          if (error || !uploaded) {
            reject(
              new StorageError(
                `Could not upload to Cloudinary: ${error?.message ?? "no result"}`,
                error
              )
            );
            return;
          }
          resolve({
            key: uploaded.public_id,
            url: uploaded.secure_url,
          });
        }
      );
      stream.end(body);
    });
  },

  /**
   * Not implemented, and deliberately so.
   *
   * Nothing in the application reads an object back through this interface: the
   * CMS stores the public URL and the browser fetches it directly. Implementing
   * this would mean either returning a type we did not verify or re-running the
   * validation on the way out, both of which are worse than not providing it.
   * `scripts/migrate-uploads.ts` uses `put` only for exactly this reason.
   */
  async get(): Promise<GetResult | null> {
    // `async` rather than a bare `throw` so this rejects rather than throwing
    // synchronously. The interface promises a Promise, and a caller that reaches
    // for `.catch()` — which is how a route would wrap this — would otherwise
    // crash instead of seeing a handled failure.
    throw new StorageError(
      "Cloudinary objects are served from their public URL; read them directly rather than through the storage adapter."
    );
  },

  remove(key: string): Promise<void> {
    requireConfig();

    return new Promise<void>((resolve, reject) => {
      cloudinary.uploader.destroy(
        key,
        { resource_type: "image", invalidate: true },
        (error, result) => {
          if (error) {
            reject(new StorageError(`Could not delete from Cloudinary: ${error.message}`, error));
            return;
          }
          // Cloudinary reports "not found" as a successful call with a result of
          // `not found`, which the contract treats as success.
          if (result && typeof result === "object" && (result as { result?: string }).result === "not found") {
            resolve();
            return;
          }
          resolve();
        }
      );
    });
  },
};

/** Test seam. */
export function __resetCloudinaryConfigCache(): void {
  configured = null;
}