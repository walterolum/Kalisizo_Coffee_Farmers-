-- Two corrections found during a full code audit:
--
-- 1. Missing indexes on nullable relations.
--    Prisma does not create an index for a relation column automatically, and all
--    three of these are nullable `onDelete: SetNull` foreign keys, so a lookup by
--    category, author or sender address degraded into a sequential scan of the
--    whole table as content accumulated. `NewsArticle.categoryId` was already
--    indexed; the other two were not.
--
--    The `(status, publishedAt)`-style composite indexes cannot serve these
--    lookups: with `status` leading the key, a query that filters only on
--    `authorId` cannot use it.
--
-- 2. `Service.status` defaulted to PUBLISHED.
--    Every other content model defaults to DRAFT, so new content is never live by
--    accident. `Service` was the exception, which let a direct write — the seed,
--    or a maintenance script — publish a program without passing through the
--    DRAFT -> IN_REVIEW -> PUBLISHED workflow. The seed now sets `status`
--    explicitly on every row it creates, so existing and freshly seeded data are
--    both unaffected by the default change.
--
-- Both statements are written to be safe to run against a database that already
-- has them, matching the style of the `soft_delete_gaps` migration.

CREATE INDEX IF NOT EXISTS "NewsArticle_authorId_idx"   ON "NewsArticle"("authorId");
CREATE INDEX IF NOT EXISTS "Project_categoryId_idx"     ON "Project"("categoryId");
CREATE INDEX IF NOT EXISTS "ContactInquiry_email_idx"   ON "ContactInquiry"("email");

-- Applies to future inserts only. No existing row is modified: the change is to
-- the column default, not to the stored data.
ALTER TABLE "Service" ALTER COLUMN "status" SET DEFAULT 'DRAFT';