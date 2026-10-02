import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * Guards the copies that make `.next/standalone` a working site.
 *
 * `output: "standalone"` means `next build` emits a bundle containing only the
 * node_modules it traced. It never copies `public/` or `.next/static/`, and the
 * Prisma engine can fall outside the trace depending on version. Running
 * `node .next/standalone/server.js` without those copies produces a failure that
 * actively misleads:
 *
 *   /api/v1/health  -> 200
 *   /               -> 200
 *   /_next/static/... -> 404
 *   /images/...       -> 404
 *   /_next/image?url= -> 400
 *
 * The process is healthy and the homepage is served, so health checks, uptime
 * monitors and deploy scripts all report success while every visitor gets an
 * unstyled page with no images. Nothing in the logs says why.
 *
 * `next start` is not an escape hatch either: with `output: "standalone"` set it
 * prints a warning and exits. So these copies are the only thing standing between
 * a successful build and a silently broken one, which is why they are made
 * automatically rather than documented as a step to remember.
 *
 * These tests drive the real copy code against a fixture, so they fail if the
 * behaviour is weakened rather than merely if the text changes.
 */

/** Path of the module under test, resolved relative to this file. */
const MODULE_URL = new URL("../scripts/start-standalone.mjs", import.meta.url).href;

/** Loads the launcher fresh so module-level state cannot leak between tests. */
async function loadLauncher() {
  return (await import(/* @vite-ignore */ MODULE_URL)) as {
    prepareStandalone: (root: string, io?: unknown) => { results: Record<string, string> };
    refreshCopy: (from: string, to: string, label: string, io?: unknown) => string;
    REQUIRED_COPIES: Array<{ label: string; from: string[]; to: string[] }>;
    PRISMA_COPIES: Array<{ label: string; from: string[]; to: string[] }>;
  };
}

/** Writes `contents` to `<root>/<relPath>`, creating parents. */
function seed(root: string, relPath: string, contents: string): void {
  const full = join(root, ...relPath.split("/"));
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, contents);
}

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "kc-standalone-"));
  // The two the build never traces.
  seed(root, "public/images/logo.png", "logo-v1");
  seed(root, "public/og.png", "og-v1");
  seed(root, ".next/static/chunks/main.abc123.js", "chunk-v1");
  seed(root, ".next/standalone/server.js", "// server");
  // Prisma, present but not traced, so the fallback copy has something to do.
  seed(root, "node_modules/.prisma/client/default.js", "engine-v1");
  seed(root, "node_modules/@prisma/client/index.js", "prisma-client-v1");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("prepareStandalone", () => {
  it("copies public/ into the bundle", async () => {
    const { prepareStandalone } = await loadLauncher();
    prepareStandalone(root, { log: () => {}, warn: () => {} });

    expect(readFileSync(join(root, ".next/standalone/public/images/logo.png"), "utf8")).toBe("logo-v1");
    expect(readFileSync(join(root, ".next/standalone/public/og.png"), "utf8")).toBe("og-v1");
  });

  it("copies .next/static/ into the bundle", async () => {
    const { prepareStandalone } = await loadLauncher();
    prepareStandalone(root, { log: () => {}, warn: () => {} });

    expect(readFileSync(join(root, ".next/standalone/.next/static/chunks/main.abc123.js"), "utf8")).toBe(
      "chunk-v1"
    );
  });

  it("copies the Prisma engine when the build did not trace it", async () => {
    const { prepareStandalone } = await loadLauncher();
    const { results } = prepareStandalone(root, { log: () => {}, warn: () => {} });

    expect(results["node_modules/.prisma"]).toBe("copied");
    expect(readFileSync(join(root, ".next/standalone/node_modules/.prisma/client/default.js"), "utf8")).toBe(
      "engine-v1"
    );
    expect(results["node_modules/@prisma/client"]).toBe("copied");
  });

  it("leaves a traced Prisma engine alone rather than copying over it", async () => {
    // Next normally traces these in, and overwriting a working engine with an
    // identical one on every start is wasted I/O.
    seed(root, ".next/standalone/node_modules/.prisma/client/default.js", "engine-traced");
    const { prepareStandalone } = await loadLauncher();
    const { results } = prepareStandalone(root, { log: () => {}, warn: () => {} });

    expect(results["node_modules/.prisma"]).toBe("traced");
    expect(readFileSync(join(root, ".next/standalone/node_modules/.prisma/client/default.js"), "utf8")).toBe(
      "engine-traced"
    );
  });

  it("replaces a previous build's assets instead of skipping when they already exist", async () => {
    const { prepareStandalone } = await loadLauncher();
    const io = { log: () => {}, warn: () => {} };

    prepareStandalone(root, io);
    expect(readFileSync(join(root, ".next/standalone/public/images/logo.png"), "utf8")).toBe("logo-v1");

    // Rebuild. Chunk names are content-hashed, so the new build has new files and
    // the old ones are still sitting there. A copy that only ran when the target
    // was missing would leave the previous build being served indefinitely.
    rmSync(join(root, "public"), { recursive: true });
    rmSync(join(root, ".next/static"), { recursive: true });
    seed(root, "public/images/logo.png", "logo-v2");
    seed(root, ".next/static/chunks/main.def456.js", "chunk-v2");

    prepareStandalone(root, io);

    expect(readFileSync(join(root, ".next/standalone/public/images/logo.png"), "utf8")).toBe("logo-v2");
    expect(readFileSync(join(root, ".next/standalone/.next/static/chunks/main.def456.js"), "utf8")).toBe(
      "chunk-v2"
    );
    // The stale chunk from the previous build must not survive.
    expect(existsSync(join(root, ".next/standalone/.next/static/chunks/main.abc123.js"))).toBe(false);
  });

  it("reports a missing source instead of silently producing an empty directory", async () => {
    rmSync(join(root, "public"), { recursive: true });
    const { prepareStandalone } = await loadLauncher();
    const { results } = prepareStandalone(root, { log: () => {}, warn: () => {} });

    expect(results["public/"]).toBe("missing");
    // Critically: no half-built directory left behind to be mistaken for a copy.
    expect(existsSync(join(root, ".next/standalone/public"))).toBe(false);
  });

  it("covers exactly the paths a standalone server cannot serve without", async () => {
    const { REQUIRED_COPIES, PRISMA_COPIES } = await loadLauncher();

    // Guards against a copy being dropped from the list: the failure is silent at
    // boot and only visible as 404s, so it would not be caught by any other test.
    expect(REQUIRED_COPIES.map((c) => c.label).sort()).toEqual([".next/static/", "public/"]);
    expect(PRISMA_COPIES.map((c) => c.label).sort()).toEqual([
      "node_modules/.prisma",
      "node_modules/@prisma/client",
    ]);
  });
});

describe("refreshCopy", () => {
  it("creates intermediate directories that do not exist yet", async () => {
    const { refreshCopy } = await loadLauncher();
    seed(root, "src/a/b.txt", "nested");

    const outcome = refreshCopy(
      join(root, "src/a"),
      join(root, "deep/nested/target"),
      "fixture",
      { log: () => {}, warn: () => {} }
    );

    expect(outcome).toBe("copied");
    expect(readFileSync(join(root, "deep/nested/target/b.txt"), "utf8")).toBe("nested");
  });
});
