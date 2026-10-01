/**
 * Removes verification records created while testing the CMS save flow, so the
 * database is left exactly as it was found. Only touches rows whose title
 * matches the explicit prefix below.
 *
 * Run with: npx tsx scripts/cleanup-verification-records.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const PREFIX = "Verification Draft Program";

async function main() {
  const rows = await prisma.service.findMany({
    where: { title: { startsWith: PREFIX } },
    select: { id: true, title: true },
  });
  if (!rows.length) {
    console.log("No verification records found.");
    return;
  }
  await prisma.service.deleteMany({ where: { title: { startsWith: PREFIX } } });
  console.log(`Removed ${rows.length} verification record(s): ${rows.map((r) => r.id).join(", ")}`);

  // Archived records can also leave audit entries, which are kept deliberately;
  // report the final state so it is obvious the table is back to normal.
  const remaining = await prisma.service.count();
  const live = await prisma.service.count({ where: { status: "PUBLISHED", deletedAt: null } });
  console.log(`Programs now: ${remaining} total, ${live} live.`);
}

main()
  .catch((error) => {
    console.error("cleanup failed:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
