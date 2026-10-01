import { PrismaClient } from "@prisma/client";

/**
 * Deliberate clean-slate reset for local development.
 *
 * This DELETES every table, including CMS users and the audit log, so it is
 * never part of a deployment. `prisma/seed.ts` is the safe, non-destructive
 * entry point and is what `npm run db:seed` runs.
 *
 * Requires CONFIRM_RESET=yes because the failure mode of running it by mistake
 * against a live database is unrecoverable without a backup.
 */
const prisma = new PrismaClient();

if (process.env.CONFIRM_RESET !== "yes") {
  console.error(
    "Refusing to reset: this deletes all content, users and the audit log.\n" +
      "Re-run with CONFIRM_RESET=yes, and only against a local database."
  );
  process.exit(1);
}

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to reset in production.");
  process.exit(1);
}

async function main() {
  console.log("Deleting all records…");

  await prisma.contactInquiry.deleteMany();
  await prisma.faqItem.deleteMany();
  await prisma.service.deleteMany();
  await prisma.heroContent.deleteMany();
  await prisma.leadershipMember.deleteMany();
  await prisma.product.deleteMany();
  await prisma.storeLocation.deleteMany();
  await prisma.successStory.deleteMany();
  await prisma.cooperativeInfo.deleteMany();

  // Editorial content is cleared before users so the join tables (tags, images)
  // and the actor references on the audit trail are removed in a valid order.
  await prisma.galleryImage.deleteMany();
  await prisma.galleryAlbum.deleteMany();
  await prisma.publication.deleteMany();
  await prisma.announcement.deleteMany();
  await prisma.page.deleteMany();
  await prisma.event.deleteMany();
  await prisma.project.deleteMany();
  await prisma.newsArticle.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.category.deleteMany();
  await prisma.socialLink.deleteMany();
  await prisma.siteSetting.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.user.deleteMany();

  console.log("All records deleted. Run `npm run db:seed` to rebuild the baseline.");
}

main()
  .catch((err) => {
    console.error("Reset failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
