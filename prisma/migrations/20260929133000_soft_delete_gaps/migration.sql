-- Soft-delete (`deletedAt`) was introduced for the editorial content models but
-- missed a few tables, so those records could only be hard-deleted. This adds
-- the column so every listable content type archives consistently.
--
-- `HeroContent` is intentionally excluded: it is a singleton row (the home page
-- hero), so there is nothing to archive.
-- `ContactInquiry` is excluded because inquiries are not public content and are
-- closed out by status, not deleted.

ALTER TABLE "GalleryAlbum"  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "FaqItem"       ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "SuccessStory"  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "GalleryAlbum_deletedAt_idx"  ON "GalleryAlbum"("deletedAt");
CREATE INDEX IF NOT EXISTS "FaqItem_deletedAt_idx"       ON "FaqItem"("deletedAt");
CREATE INDEX IF NOT EXISTS "SuccessStory_deletedAt_idx"  ON "SuccessStory"("deletedAt");
