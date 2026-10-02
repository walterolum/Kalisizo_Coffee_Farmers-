import { prisma } from "@/backend/prisma";

/**
 * Whether a real database is reachable from the test run.
 *
 * Almost every test in this suite is a pure unit test over a function: no
 * network, no filesystem, no clock. That is deliberate, because a unit test that
 * silently depends on a developer's local Postgres stops being a test of the code
 * and becomes a test of the machine.
 *
 * A handful of assertions genuinely need to see the real schema — a hard-coded
 * list of URL columns would be a latent data-loss bug that no pure test can
 * catch, because "correct" is defined against the database. Those call this and
 * skip themselves when the answer is no, which keeps `npm test` meaningful on a
 * fresh clone with no database while still running the check where a database
 * exists.
 *
 * The result is memoised: several tests may ask, and the probe should cost one
 * round trip rather than one per test. It is also deliberately swallowed — a
 * failed probe means "no database", not "the audit failed", and the caller
 * reports that as a skip.
 */

let cached: Promise<boolean> | null = null;

export function databaseAvailable(): Promise<boolean> {
  cached ??= prisma
    // A trivial statement rather than a schema query: this asks "is there a
    // database", which is the only question being answered here.
    .$queryRawUnsafe<Array<{ ok: number }>>("SELECT 1 AS ok")
    .then((rows) => Array.isArray(rows) && rows.length > 0)
    .catch(() => false);
  return cached;
}

/**
 * Closes the shared Prisma connection.
 *
 * Vitest isolates each test file into its own module registry, so this ends that
 * file's pool rather than the whole run's — but the pool still holds real
 * Postgres backends, and 26 files each opening their own would exhaust
 * `max_connections` on a default local server. Releasing it keeps the load the
 * suite puts on a developer's database close to one connection per file that
 * actually needs one.
 *
 * Swallowed for the same reason as the probe: not being able to close cleanly
 * after skipping a test is not itself a failure.
 */
export async function disconnectQuietly(): Promise<void> {
  await prisma.$disconnect().catch(() => {});
}