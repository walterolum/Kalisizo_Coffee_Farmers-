/**
 * Reports migrations recorded in the database that are not present on disk.
 *
 * `prisma migrate status` only compares what is on disk against what is applied,
 * so it cannot see a migration that was applied and later deleted from the
 * repository. That gap matters directly for a hosted-database cutover: the
 * target has to be built from the schema that actually exists, and the recorded
 * history is the only evidence of what that schema went through.
 */
import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient();

  const rows = await prisma.$queryRaw<
    Array<{ migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }>
  >`
    SELECT migration_name, finished_at, rolled_back_at
    FROM "_prisma_migrations"
    ORDER BY started_at ASC
  `;

  const { readdirSync, existsSync } = await import("node:fs");

  const onDisk = existsSync("prisma/migrations")
    ? readdirSync("prisma/migrations", { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
    : [];

  const onDiskSet = new Set(onDisk);
  const dbNames = rows.map((r) => r.migration_name);

  const missingOnDisk = dbNames.filter((n) => !onDiskSet.has(n));
  const neverApplied = onDisk.filter((n) => !dbNames.includes(n));

  const incomplete = rows.filter((r) => !r.finished_at && !r.rolled_back_at);

  console.log(`\nOn disk: ${onDisk.length}   In database: ${dbNames.length}`);
  console.log(`\nApplied but NOT on disk (${missingOnDisk.length}):`);
  for (const n of missingOnDisk) console.log(`  - ${n}`);
  console.log(`\nOn disk but NOT applied (${neverApplied.length}):`);
  for (const n of neverApplied) console.log(`  - ${n}`);
  console.log(`\nIn database but neither finished nor rolled back (${incomplete.length}):`);
  for (const n of incomplete) console.log(`  - ${n}`);

  if (missingOnDisk.length === 0 && neverApplied.length === 0 && incomplete.length === 0) {
    console.log("\nNo drift.");
  }

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error("failed:", error);
  process.exit(1);
});