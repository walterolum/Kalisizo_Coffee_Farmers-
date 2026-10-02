import { mkdir, writeFile, rm, stat } from "fs/promises";
import { createReadStream } from "fs";
import path from "path";
import { Readable } from "stream";

import {
  contentTypeFor,
  resolveStoredFile,
  uploadsDir,
} from "@/backend/upload-storage";
import { StorageError, type GetResult, type PutInput, type StorageBackend, type StoredObject } from "@/shared/storage/types";
import { publicUrlFor } from "@/backend/upload-storage";

/**
 * Local disk storage, and the reference implementation of the contract.
 *
 * Objects are written outside `public/` and served by the `/uploads/[file]`
 * route. `public/` cannot be used because Next.js resolves it from a file list
 * captured at server start, so a file written there afterwards 404s until the
 * process restarts.
 *
 * This is the development backend and the fallback for a server with a persistent
 * filesystem. It cannot be used on a serverless host, where the filesystem is
 * ephemeral — which is why `localUploadsEnabled` refuses in production unless
 * explicitly opted into.
 *
 * The traversal defences are unchanged and still the important part: keys are
 * matched against the shared `<timestamp>-<hex>.<ext>` allowlist before they
 * reach the filesystem, and the resolved path is re-checked for containment.
 */
export const localBackend: StorageBackend = {
  name: "local",

  async put({ key, body, contentType }: PutInput): Promise<StoredObject> {
    const absolute = resolveStoredFile(key);
    if (!absolute) {
      // Only ever reachable if a caller skipped key generation. Refusing here
      // means a bad key cannot reach the filesystem even if the allowlist is
      // later loosened.
      throw new StorageError(`Refusing to write a key this module could not have generated: ${key}`);
    }

    // Cross-check the declared type against the key's extension. They are
    // derived from the same table at generation time, so a mismatch means the
    // caller assembled the pair wrongly.
    if (contentTypeFor(key) !== contentType) {
      throw new StorageError(
        `Content type ${contentType} does not match the extension of ${key}`
      );
    }

    const dir = uploadsDir();

    try {
      await mkdir(dir, { recursive: true });
      // `flag: "wx"` fails rather than overwriting. Generated keys should never
      // collide, and if they somehow do, replacing an existing editor's image is
      // far worse than refusing the upload.
      await writeFile(absolute, body, { flag: "wx" });
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === "EEXIST") {
        throw new StorageError("An object with that key already exists.");
      }
      throw new StorageError("Could not write the upload to local storage.", error);
    }

    return { key, url: publicUrlFor(key) };
  },

  async get(key: string): Promise<GetResult | null> {
    const absolute = resolveStoredFile(key);
    if (!absolute) return null;

    const contentType = contentTypeFor(key);
    if (!contentType) return null;

    let info: Awaited<ReturnType<typeof stat>>;
    try {
      info = await stat(absolute);
    } catch {
      return null;
    }

    // Directories and other non-regular files are not objects.
    if (!info.isFile()) return null;

    const stream = createReadStream(absolute);
    return {
      body: Readable.toWeb(stream) as ReadableStream<Uint8Array>,
      contentType,
      size: info.size,
    };
  },

  async remove(key: string): Promise<void> {
    const absolute = resolveStoredFile(key);
    // A key this module could not have written names nothing of ours. Treat it
    // as already gone rather than an error.
    if (!absolute) return;

    try {
      await rm(absolute, { force: true });
    } catch (error) {
      throw new StorageError("Could not remove the stored object.", error);
    }
  },
};

/** Exposed for tests and diagnostics. */
export const localUploadsPath = uploadsDir;
export const localPathJoin = path.join;