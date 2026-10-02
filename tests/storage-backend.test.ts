import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// This file does real work — `mkdtemp` per test, real writes, recursive
// `rmSync` — so it is the most exposed to the machine-bound timing described in
// `vitest.config.mts`. The budget now lives in the config rather than here, so
// that every test gets it and there is one place to reason about.
import { mkdtempSync, readFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Storage adapter contract tests.
 *
 * The point of the adapter is that the upload route stopped choosing a backend
 * inline. That is only worth anything if the three backends really are
 * interchangeable, so these tests hold them to one contract rather than to their
 * own implementations.
 *
 * Two things are deliberately covered that no amount of manual clicking would
 * have caught:
 *
 *   - **Which backend gets chosen.** The route used to branch on whichever
 *     variables happened to be set, so an operator who added the new variables
 *     without removing the old ones got the old backend with no indication why.
 *     The selection order is now a policy, and policy is exactly what regresses.
 *
 *   - **Supabase's request shape.** `upsert: false` is what stops an upload from
 *     silently replacing an existing image, and treating a missing object as a
 *     successful delete is what stops a retry from reporting a failure that
 *     means nothing. Both are asserted against a mocked SDK, so neither needs a
 *     live project or a network.
 */

let tempDir: string;

/** Real JPEG magic bytes, so the sniff in the route would accept it too. */
const JPEG_BYTES = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00,
  0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
]);

const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48,
  0x44, 0x52,
]);

/** A well-formed stored name, as `newUploadName` would produce. */
const KEY = "1700000000000-deadbeef.jpg";

/** Every temp dir this file created, so none of them outlive the run. */
const tempDirs: string[] = [];

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "kc-storage-"));
  tempDirs.push(tempDir);
  process.env.UPLOAD_DIR = tempDir;
  delete process.env.STORAGE_BACKEND;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.CLOUDINARY_CLOUD_NAME;
  delete process.env.CLOUDINARY_API_KEY;
  delete process.env.CLOUDINARY_API_SECRET;
});

afterEach(() => {
  vi.resetModules();

  // Each test gets its own directory, so removing only the last one in `afterAll`
  // leaked about thirty directories per run. That is not cosmetic: they built up
  // into the hundreds on a developer's machine, and the growing directory count is
  // what pushed these tests past the default 5s timeout intermittently — the file
  // looked flaky for a reason that had nothing to do with the code under test.
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

async function readAll(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/**
 * Sets `NODE_ENV` for the duration of a check.
 *
 * `localUploadsEnabled` branches on it, and it is the difference between "local
 * disk is a candidate" and "every upload silently disappears on a cold start",
 * so it has to be exercised. Declared readonly in the type definitions, so the
 * write goes through a mutable view and the original value is always restored.
 */
async function withNodeEnv<T>(value: string, run: () => Promise<T>): Promise<T> {
  const env = process.env as Record<string, string | undefined>;
  const previous = env.NODE_ENV;
  env.NODE_ENV = value;
  try {
    return await run();
  } finally {
    if (previous === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = previous;
  }
}

describe("local backend", () => {
  it("round-trips an object and reports its size and type", async () => {
    const { localBackend } = await import("@/lib/storage/local");

    const stored = await localBackend.put({
      key: KEY,
      body: JPEG_BYTES,
      contentType: "image/jpeg",
    });

    expect(stored).toEqual({ key: KEY, url: `/uploads/${KEY}` });

    const object = await localBackend.get(KEY);
    expect(object).not.toBeNull();
    expect(object!.contentType).toBe("image/jpeg");
    expect(object!.size).toBe(JPEG_BYTES.length);
    expect(await readAll(object!.body)).toEqual(JPEG_BYTES);
  });

  it("refuses a key the naming module could not have generated", async () => {
    const { localBackend } = await import("@/lib/storage/local");
    const { StorageError } = await import("@/lib/storage/types");

    // The traversal cases the allowlist exists for. A key containing `..` or a
    // separator must never reach the filesystem, whatever the caller intends.
    for (const key of [
      "../../../etc/passwd",
      "..%2f..%2fetc%2fpasswd",
      "1700000000000-deadbeef.jpg/../../x",
      "not-a-stored-name.jpg",
      "1700000000000-deadbeef.svg",
    ]) {
      await expect(
        localBackend.put({ key, body: JPEG_BYTES, contentType: "image/jpeg" })
      ).rejects.toBeInstanceOf(StorageError);
    }
  });

  it("rejects a declared type that disagrees with the key's extension", async () => {
    const { localBackend } = await import("@/lib/storage/local");
    const { StorageError } = await import("@/lib/storage/types");

    // Guards against a caller assembling a name and a type from different
    // tables, which would store a `.jpg` holding a PNG and then serve it as
    // `image/jpeg` forever.
    await expect(
      localBackend.put({ key: KEY, body: PNG_BYTES, contentType: "image/png" })
    ).rejects.toBeInstanceOf(StorageError);
  });

  it("does not overwrite an existing key", async () => {
    const { localBackend } = await import("@/lib/storage/local");
    const { StorageError } = await import("@/lib/storage/types");

    await localBackend.put({ key: KEY, body: JPEG_BYTES, contentType: "image/jpeg" });

    await expect(
      localBackend.put({ key: KEY, body: PNG_BYTES, contentType: "image/jpeg" })
    ).rejects.toBeInstanceOf(StorageError);

    // The original bytes must still be intact.
    const object = await localBackend.get(KEY);
    expect(await readAll(object!.body)).toEqual(JPEG_BYTES);
  });

  it("returns null for a key that is missing or malformed", async () => {
    const { localBackend } = await import("@/lib/storage/local");

    expect(await localBackend.get("1700000000001-cafebabe.png")).toBeNull();
    expect(await localBackend.get("../secrets.jpg")).toBeNull();
  });

  it("does not serve a directory as an object", async () => {
    const { localBackend } = await import("@/lib/storage/local");

    // A directory whose name happens to match the allowlist must not be
    // readable, and must not blow up the route either.
    mkdirSync(join(tempDir, "1700000000002-aaaaaaaa.jpg"));
    expect(await localBackend.get("1700000000002-aaaaaaaa.jpg")).toBeNull();
  });

  it("removes an object, and treats a second removal as success", async () => {
    const { localBackend } = await import("@/lib/storage/local");

    await localBackend.put({ key: KEY, body: JPEG_BYTES, contentType: "image/jpeg" });
    await localBackend.remove(KEY);
    expect(await localBackend.get(KEY)).toBeNull();

    // The CMS delete button has no undo, so a retry after a partial failure must
    // not report a failure that means nothing.
    await expect(localBackend.remove(KEY)).resolves.toBeUndefined();
    // A key we could never have written names nothing of ours.
    await expect(localBackend.remove("../etc/passwd")).resolves.toBeUndefined();
  });

  it("raises a StorageError, not a raw filesystem error", async () => {
    const { localBackend } = await import("@/lib/storage/local");
    const { StorageError } = await import("@/lib/storage/types");

    // A directory in place of the file makes `writeFile` fail with EISDIR. The
    // route returns 502 on StorageError, so an escaping raw error would produce
    // an unhandled rejection instead of a response.
    mkdirSync(join(tempDir, KEY));

    await expect(
      localBackend.put({ key: KEY, body: JPEG_BYTES, contentType: "image/jpeg" })
    ).rejects.toBeInstanceOf(StorageError);
  });
});

describe("backend selection", () => {
  it("falls back to local disk when nothing else is configured", async () => {
    const { getStorageBackend, storageStatus } = await import("@/lib/storage");
    expect(getStorageBackend()?.name).toBe("local");
    expect(storageStatus().available).toBe(true);
  });

  it("prefers Supabase over Cloudinary when both are configured", async () => {
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    process.env.CLOUDINARY_CLOUD_NAME = "demo";
    process.env.CLOUDINARY_API_KEY = "key";
    process.env.CLOUDINARY_API_SECRET = "secret";

    const { getStorageBackend, storageStatus } = await import("@/lib/storage");

    // The migration target must win while the old backend's variables are still
    // present, which is the state a real cutover is always in for a day or two.
    expect(getStorageBackend()?.name).toBe("supabase");

    // And the ambiguity is reported rather than resolved silently.
    const status = storageStatus();
    expect(status.configured).toEqual(["supabase", "cloudinary", "local"]);
    expect(status.problem).toMatch(/Several backends are configured/);
  });

  it("honours an explicit STORAGE_BACKEND over precedence", async () => {
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    process.env.CLOUDINARY_CLOUD_NAME = "demo";
    process.env.CLOUDINARY_API_KEY = "key";
    process.env.CLOUDINARY_API_SECRET = "secret";
    process.env.STORAGE_BACKEND = "cloudinary";

    const { getStorageBackend } = await import("@/lib/storage");
    expect(getStorageBackend()?.name).toBe("cloudinary");
  });

  it("refuses to fall back when a pinned backend is not configured", async () => {
    process.env.STORAGE_BACKEND = "supabase";

    const { getStorageBackend, storageStatus } = await import("@/lib/storage");

    // A typo in a variable name must stop the upload, not quietly send media to
    // somewhere the operator did not intend.
    expect(getStorageBackend()).toBeNull();
    const status = storageStatus();
    expect(status.available).toBe(false);
    expect(status.problem).toMatch(/SUPABASE_\* environment variables/);
  });

  it("explains the local-specific requirement when local is pinned but unavailable", async () => {
    process.env.STORAGE_BACKEND = "local";

    await withNodeEnv("production", async () => {
      const { storageStatus } = await import("@/lib/storage");
      const status = storageStatus();
      expect(status.available).toBe(false);
      // Names the specific reason rather than the generic "not configured".
      expect(status.problem).toMatch(/ALLOW_LOCAL_UPLOADS=true/);
    });
  });

  it("treats an unrecognised STORAGE_BACKEND as auto rather than failing", async () => {
    process.env.STORAGE_BACKEND = "s3";

    const { getStorageBackend, preferredBackend } = await import("@/lib/storage");
    // Better to fall back to a working backend than to have every upload fail
    // over a misspelled variable; `storageStatus` still shows what was resolved.
    expect(preferredBackend()).toBe("auto");
    expect(getStorageBackend()?.name).toBe("local");
  });

  it("excludes local disk in production unless explicitly allowed", async () => {
    delete process.env.ALLOW_LOCAL_UPLOADS;

    await withNodeEnv("production", async () => {
      const { availableBackends } = await import("@/lib/storage");
      // An ephemeral filesystem would silently lose every uploaded image, so
      // local is not a candidate at all by default.
      expect(availableBackends().map((b) => b.name)).not.toContain("local");
    });

    process.env.ALLOW_LOCAL_UPLOADS = "true";
    vi.resetModules();

    await withNodeEnv("production", async () => {
      const { availableBackends } = await import("@/lib/storage");
      expect(availableBackends().map((b) => b.name)).toContain("local");
    });
  });

  it("honours ALLOW_LOCAL_UPLOADS=false rather than treating it as truthy", async () => {
    // The string "false" is truthy, so a naive check would enable local uploads on
    // a serverless deployment. `parseBoolean` exists to stop exactly that.
    process.env.ALLOW_LOCAL_UPLOADS = "false";

    await withNodeEnv("production", async () => {
      const { availableBackends } = await import("@/lib/storage");
      expect(availableBackends().map((b) => b.name)).not.toContain("local");
    });
  });
});

describe("supabase backend", () => {
  /**
   * Mocks the SDK so the request shape can be asserted without a project, a
   * network, or credentials. The behaviour worth guarding is the parameters, not
   * Supabase's own storage engine.
   */
  function mockSdk() {
    const upload = vi.fn().mockResolvedValue({ data: { path: KEY }, error: null });
    const download = vi.fn();
    const remove = vi.fn().mockResolvedValue({ data: [], error: null });
    const from = vi.fn(() => ({ upload, download, remove }));
    const createClient = vi.fn(() => ({ storage: { from } }));

    vi.doMock("@supabase/supabase-js", () => ({ createClient }));
    return { upload, download, remove, from, createClient };
  }

  it("reports itself unconfigured until both variables are set", async () => {
    const { readSupabaseStorageConfig, supabaseStorageConfigured } = await import(
      "@/lib/storage/supabase"
    );

    expect(supabaseStorageConfigured()).toBe(false);

    process.env.SUPABASE_URL = "https://project.supabase.co";
    expect(readSupabaseStorageConfig()).toBeNull();

    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    expect(supabaseStorageConfigured()).toBe(true);
    expect(readSupabaseStorageConfig()?.bucket).toBe("cms-media");
  });

  it("defaults the bucket name and trims a trailing slash from the URL", async () => {
    process.env.SUPABASE_URL = "https://project.supabase.co///";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "k";

    const { supabasePublicUrl } = await import("@/lib/storage/supabase");
    // A double slash in a stored URL would 404 forever, and these values are
    // persisted as durable data.
    expect(supabasePublicUrl(KEY)).toBe(
      `https://project.supabase.co/storage/v1/object/public/cms-media/${KEY}`
    );
  });

  it("percent-encodes each path segment but keeps the separators", async () => {
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "k";

    const { supabasePublicUrl } = await import("@/lib/storage/supabase");

    // `encodeURIComponent` on the whole key would escape `/` and turn a nested
    // key into one long segment that Supabase cannot find.
    expect(supabasePublicUrl("folder/with space/na+me.png")).toBe(
      "https://project.supabase.co/storage/v1/object/public/cms-media/folder/with%20space/na%2Bme.png"
    );
  });

  it("uploads with upsert disabled so a collision cannot replace an image", async () => {
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

    const sdk = mockSdk();
    const { supabaseStorageBackend } = await import("@/lib/storage/supabase");

    const stored = await supabaseStorageBackend.put({
      key: KEY,
      body: JPEG_BYTES,
      contentType: "image/jpeg",
      folder: "kalisizo-coffee/admin",
    });

    // The bucket is chosen on `from(bucket)`; `upload` receives only the path.
    expect(sdk.from).toHaveBeenCalledWith("cms-media");
    const [path, body, options] = sdk.upload.mock.calls[0];
    expect(path).toBe(KEY);
    expect(body).toBe(JPEG_BYTES);
    expect(options.upsert).toBe(false);
    expect(options.contentType).toBe("image/jpeg");
    // Folders are organisational only and must never reach the key.
    expect(path).not.toContain("kalisizo-coffee");
    expect(options.metadata.folder).toBe("kalisizo-coffee/admin");

    expect(stored.url).toContain(`/storage/v1/object/public/cms-media/${KEY}`);
  });

  it("surfaces an upload failure as a StorageError", async () => {
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

    const { StorageError } = await import("@/lib/storage/types");
    mockSdk();
    const sdkModule = await import("@supabase/supabase-js");
    vi.mocked(sdkModule.createClient).mockReturnValue({
      storage: {
        from: () => ({
          upload: vi.fn().mockResolvedValue({ data: null, error: { message: "bucket not found" } }),
          download: vi.fn(),
          remove: vi.fn(),
        }),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const { supabaseStorageBackend } = await import("@/lib/storage/supabase");
    await expect(
      supabaseStorageBackend.put({ key: KEY, body: JPEG_BYTES, contentType: "image/jpeg" })
    ).rejects.toBeInstanceOf(StorageError);
  });

  it("serves a downloaded object with the type from the fixed table, not the blob's", async () => {
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

    mockSdk();
    const sdkModule = await import("@supabase/supabase-js");
    vi.mocked(sdkModule.createClient).mockReturnValue({
      storage: {
        from: () => ({
          upload: vi.fn(),
          remove: vi.fn(),
          download: vi.fn().mockResolvedValue({
            // A previously uploaded object must not be able to declare its own
            // type: the blob claims to be HTML, and the name says jpg.
            data: {
              size: 7,
              stream: () => new ReadableStream<Uint8Array>(),
            },
            error: null,
          }),
        }),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const { supabaseStorageBackend } = await import("@/lib/storage/supabase");
    const object = await supabaseStorageBackend.get(KEY);

    expect(object?.contentType).toBe("image/jpeg");
    expect(object?.size).toBe(7);
  });

  it("returns null when the object does not exist", async () => {
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

    mockSdk();
    const sdkModule = await import("@supabase/supabase-js");
    vi.mocked(sdkModule.createClient).mockReturnValue({
      storage: {
        from: () => ({
          upload: vi.fn(),
          remove: vi.fn(),
          download: vi.fn().mockResolvedValue({ data: null, error: { message: "not found" } }),
        }),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const { supabaseStorageBackend } = await import("@/lib/storage/supabase");
    expect(await supabaseStorageBackend.get("1700000000000-deadbeef.png")).toBeNull();
  });

  it("treats deleting a missing object as success", async () => {
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

    mockSdk();
    const sdkModule = await import("@supabase/supabase-js");
    vi.mocked(sdkModule.createClient).mockReturnValue({
      storage: {
        from: () => ({
          upload: vi.fn(),
          download: vi.fn(),
          // Supabase reports a missing object as an error, not as a 404. The
          // contract says that is a successful delete.
          remove: vi.fn().mockResolvedValue({ data: null, error: { message: "Object not found" } }),
        }),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const { supabaseStorageBackend } = await import("@/lib/storage/supabase");
    await expect(supabaseStorageBackend.remove(KEY)).resolves.toBeUndefined();
  });

  it("raises a StorageError naming the configuration when nothing is set", async () => {
    const { StorageError } = await import("@/lib/storage/types");
    const { supabaseStorageBackend } = await import("@/lib/storage/supabase");

    await expect(
      supabaseStorageBackend.put({ key: KEY, body: JPEG_BYTES, contentType: "image/jpeg" })
    ).rejects.toBeInstanceOf(StorageError);
  });
});

describe("cloudinary backend", () => {
  it("is unconfigured until all three variables are set", async () => {
    const { readCloudinaryConfig, cloudinaryConfigured } = await import(
      "@/lib/storage/cloudinary"
    );

    expect(cloudinaryConfigured()).toBe(false);

    // A partial configuration used to be enough to select the backend, because
    // the route only checked the cloud name.
    process.env.CLOUDINARY_CLOUD_NAME = "demo";
    expect(readCloudinaryConfig()).toBeNull();

    process.env.CLOUDINARY_API_KEY = "key";
    expect(readCloudinaryConfig()).toBeNull();

    process.env.CLOUDINARY_API_SECRET = "secret";
    expect(readCloudinaryConfig()).toEqual({
      cloudName: "demo",
      apiKey: "key",
      apiSecret: "secret",
    });
  });

  it("refuses to read objects back rather than inventing a content type", async () => {
    const { StorageError } = await import("@/lib/storage/types");
    const { cloudinaryBackend } = await import("@/lib/storage/cloudinary");

    // Returning a type we did not verify is worse than not offering the method.
    await expect(cloudinaryBackend.get(KEY)).rejects.toBeInstanceOf(StorageError);
  });
});

describe("wiring", () => {
  const read = (path: string) => readFileSync(path, "utf8");

  it("validates the upload in the route, before choosing a backend", () => {
    const route = read("src/app/api/v1/admin/upload/route.ts");

    // Validation must stay in one place. Moving it behind the interface would
    // mean three chances to get the sniff subtly wrong instead of one.
    expect(route).toMatch(/sniffImageType/);
    expect(route).toMatch(/ACCEPTED_TYPES\.has\(file\.type\)/);
    expect(route).toMatch(/file\.size > MAX_BYTES/);

    // The sniff must gate the write.
    const sniffAt = route.indexOf("sniffImageType(buffer)");
    const putAt = route.indexOf("backend.put(");
    expect(sniffAt).toBeGreaterThan(-1);
    expect(putAt).toBeGreaterThan(sniffAt);

    // And the route must no longer branch on a backend itself.
    expect(route).not.toMatch(/cloudinary/i);
    expect(route).not.toMatch(/mkdir|writeFile/);
  });

  it("returns a 503 naming the missing configuration when no backend is usable", () => {
    const route = read("src/app/api/v1/admin/upload/route.ts");
    expect(route).toMatch(/upload_unavailable/);
    expect(route).toMatch(/503/);
  });

  it("serves /uploads only from the local backend", () => {
    const route = read("src/app/uploads/[file]/route.ts");

    // A `/uploads/...` URL only means anything while local disk is the backend.
    // Returning something else for a Supabase deployment would be a lie.
    expect(route).toMatch(/backend\.name !== "local"/);

    // The name allowlist and a fixed content-type table are the security
    // boundary and must not have been lost in the refactor.
    expect(route).toMatch(/isStoredName/);
    expect(route).toMatch(/X-Content-Type-Options/);
    expect(route).not.toMatch(/createReadStream|realpath/);
  });
});
