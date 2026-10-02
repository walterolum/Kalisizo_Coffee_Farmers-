/**
 * Runs the production build the way `output: "standalone"` requires.
 *
 * `next start` is not a supported entry point once `output: "standalone"` is set.
 * Next.js prints "next start does not work with output: standalone
 * configuration" and exits. The supported entry point is the generated
 * `.next/standalone/server.js`, and serving a complete site from it takes three
 * copies that `next build` deliberately does not make:
 *
 *   public/                                          static files
 *   .next/static/                                    JS/CSS chunks
 *   node_modules/.prisma and @prisma/client           Prisma query engine
 *
 * The standalone bundle holds only the node_modules it traced. `public/` and
 * `.next/static/` are not traced at all, and the Prisma query engine can fall
 * outside the trace depending on the Prisma version. The Dockerfile's `runner`
 * stage already performs all three copies; this is the same set for running the
 * build directly on a workstation.
 *
 * Without the first two the server starts cleanly and then 404s every
 * stylesheet and image, which reads as a broken deploy rather than a missing
 * copy step. Without the third it starts cleanly and fails on the first query,
 * which is worse: /api/v1/health passes and only later requests break.
 *
 * `.next/static` is refreshed on every run instead of being skipped when the
 * target exists. Chunk filenames are content-hashed, so each build produces new
 * files and leaves the previous ones behind; a copy that only ran when the
 * directory was missing would keep serving an older build's assets indefinitely.
 *
 * Plain .mjs rather than .ts+tsx on purpose: this is the one script that has to
 * run in a production-shaped environment, where dev dependencies are absent. The
 * repo's other .ts scripts are fine on tsx because they are development tools.
 *
 * Usage: node scripts/start-standalone.mjs   (wired up as `npm start`)
 */
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Locations copied into the standalone bundle before it can serve a full site. */
export const REQUIRED_COPIES = [
  { label: "public/", from: ["public"], to: ["public"] },
  { label: ".next/static/", from: [".next", "static"], to: [".next", "static"] },
];

/**
 * Prisma pieces, copied only when the build's trace missed them.
 *
 * The Dockerfile copies these unconditionally because that behaviour varies by
 * Prisma version, but overwriting a working traced engine with an identical one
 * is wasted I/O on every start.
 */
export const PRISMA_COPIES = [
  { label: "node_modules/.prisma", from: ["node_modules", ".prisma"], to: ["node_modules", ".prisma"] },
  {
    label: "node_modules/@prisma/client",
    from: ["node_modules", "@prisma", "client"],
    to: ["node_modules", "@prisma", "client"],
  },
];

/**
 * Replaces `to` with a fresh copy of `from`.
 *
 * The target is always removed first. That is the whole point: a stale
 * content-hashed chunk left behind by an earlier build is served forever if the
 * copy is skipped when the directory already exists.
 *
 * @param {string} from
 * @param {string} to
 * @param {string} label
 * @param {{ warn?: (msg: string) => void, log?: (msg: string) => void }} io
 */
export function refreshCopy(from, to, label, io = {}) {
  const log = io.log ?? console.log;
  const warn = io.warn ?? console.warn;

  if (!existsSync(from)) {
    warn(`  skip  ${label} (missing: ${from})`);
    return "missing";
  }
  rmSync(to, { recursive: true, force: true });
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to, { recursive: true });
  log(`  copy  ${label}  ->  ${to}`);
  return "copied";
}

/**
 * Performs every copy the standalone bundle needs.
 *
 * @param {string} projectRoot
 * @param {{ log?: (msg: string) => void, warn?: (msg: string) => void }} io
 */
export function prepareStandalone(projectRoot, io = {}) {
  const standaloneDir = join(projectRoot, ".next", "standalone");
  const results = {};

  for (const { label, from, to } of REQUIRED_COPIES) {
    results[label] = refreshCopy(join(projectRoot, ...from), join(standaloneDir, ...to), label, io);
  }

  for (const { label, from, to } of PRISMA_COPIES) {
    const source = join(projectRoot, ...from);
    const target = join(standaloneDir, ...to);
    if (!existsSync(source)) {
      (io.warn ?? console.warn)(`  skip  ${label} (not installed)`);
      results[label] = "missing";
    } else if (existsSync(target)) {
      (io.log ?? console.log)(`  ok    ${label}  (already traced into the bundle)`);
      results[label] = "traced";
    } else {
      results[label] = refreshCopy(source, target, label, io);
    }
  }

  return { standaloneDir, results };
}

/** Starts the prepared bundle, inheriting stdio and the caller's environment. */
export function startServer(standaloneDir, { env = process.env } = {}) {
  return spawn(process.execPath, ["server.js"], {
    cwd: standaloneDir,
    stdio: "inherit",
    env: { ...env, NODE_ENV: "production" },
  });
}

function main() {
  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const standaloneDir = join(projectRoot, ".next", "standalone");
  const serverEntry = join(standaloneDir, "server.js");

  if (!existsSync(serverEntry)) {
    console.error(
      "No standalone build found at .next/standalone/server.js.\n" +
        "Run `npm run build` first."
    );
    process.exit(1);
  }

  console.log("Preparing .next/standalone for server.js\n");
  prepareStandalone(projectRoot);

  console.log("\nStarting server.js from .next/standalone\n");
  const child = startServer(standaloneDir);

  child.on("error", (error) => {
    console.error("Failed to start .next/standalone/server.js:", error);
    process.exit(1);
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });

  // Forward interrupts so Ctrl-C reaches the server instead of orphaning it on
  // the port. Without this, stopping `npm start` leaves the listener holding 3000
  // and the next `npm run dev` silently moves to another port.
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => child.kill(signal));
  }
}

// Only run when invoked directly, so the tests can import the copy logic without
// a server being spawned underneath them.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
