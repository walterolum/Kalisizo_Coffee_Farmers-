/**
 * Restores the `CooperativeInfo` row to the values the seed script creates.
 *
 * Needed because `POST /api/v1/admin/settings` accepted an empty body and wrote
 * it through, clearing the phone numbers, taglines and social links. Those
 * values are the cooperative's real public contact details, and they are only
 * recorded in one place — `prisma/seed.ts` — so the seed is the source of truth
 * for putting them back.
 *
 * Only fields the seed defines are touched. Anything an administrator has since
 * added and the seed does not mention is left alone.
 *
 * Run with: npx tsx scripts/restore-contact-details.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const RESTORE = {
  mission:
    "To unite coffee farmers in Kalisizo and beyond into a strong, member-driven cooperative that guarantees fair prices, quality extension support and affordable financing - turning smallholder effort into shared prosperity.",
  vision:
    "A thriving, self-reliant cooperative where every member is treated fairly, incomes grow sustainably and transparency guides every transaction.",
  taglines: ["Working Together with Transparency & Respect", "Together for Quality, Together for Prosperity!"],
  phoneNumbers: ["0774740871", "0701740871", "0705487223"],
  officialEmail: "kalisizocoop@gmail.com",
  address:
    "Kalisizo Coffee Farmers Cooperative Society Ltd, Kalisizo Town, Kyotera District, Uganda",
};

async function main() {
  const before = await prisma.cooperativeInfo.findFirst();
  if (!before) {
    console.error("no CooperativeInfo row exists; nothing to restore");
    process.exitCode = 1;
    return;
  }

  const emptied = Object.entries(RESTORE).filter(([key, value]) => {
    const current = before[key as keyof typeof RESTORE];
    return Array.isArray(value) ? (current?.length ?? 0) === 0 : !current;
  });

  if (emptied.length === 0) {
    console.log("contact details are already populated; nothing to do");
    return;
  }

  console.log(`restoring ${emptied.map(([k]) => k).join(", ")}`);

  await prisma.cooperativeInfo.updateMany({ data: RESTORE });

  const after = await prisma.cooperativeInfo.findFirstOrThrow();
  for (const key of Object.keys(RESTORE)) {
    console.log(`  ${key}: ${JSON.stringify(after[key as keyof typeof after])}`);
  }
}

main()
  .catch((error) => {
    console.error("restore failed:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
