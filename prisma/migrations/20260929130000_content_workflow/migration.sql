-- Editorial content platform: publishing workflow, taxonomy and media library.
--
-- Adds the content models the public website needs (news, events, projects,
-- announcements, publications, pages, gallery albums) plus the three-tier role
-- model. Existing rows are preserved: FAQ timestamps and service slugs are
-- backfilled before their NOT NULL constraints are applied, and the cooperative's
-- social URLs are migrated from `CooperativeInfo` into the new `SocialLink` table.

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ProjectStage" AS ENUM ('PLANNED', 'ONGOING', 'COMPLETED');

-- CreateEnum
CREATE TYPE "AnnouncementSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "PublicationKind" AS ENUM ('REPORT', 'BROCHURE', 'FORM', 'POLICY', 'OTHER');

-- CreateTable
CREATE TABLE "public"."SiteSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL DEFAULT '',
    "group" TEXT NOT NULL DEFAULT 'general',
    "label" TEXT NOT NULL,
    "description" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "public"."SocialLink" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "description" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Tag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NewsArticle" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "featuredImageUrl" TEXT,
    "imageAlt" TEXT,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "authorId" TEXT,
    "categoryId" TEXT,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "NewsArticle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Event" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "description" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3),
    "location" TEXT,
    "organizer" TEXT,
    "imageUrl" TEXT,
    "imageAlt" TEXT,
    "registrationInfo" TEXT,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Project" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "stage" "ProjectStage" NOT NULL DEFAULT 'ONGOING',
    "imageUrl" TEXT,
    "imageAlt" TEXT,
    "partners" TEXT[] ,
    "impact" TEXT,
    "categoryId" TEXT,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Announcement" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "severity" "AnnouncementSeverity" NOT NULL DEFAULT 'INFO',
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "linkUrl" TEXT,
    "linkLabel" TEXT,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Publication" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "summary" TEXT,
    "fileUrl" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "kind" "PublicationKind" NOT NULL DEFAULT 'OTHER',
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Publication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Page" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "excerpt" TEXT,
    "content" TEXT NOT NULL,
    "imageUrl" TEXT,
    "imageAlt" TEXT,
    "showInFooter" BOOLEAN NOT NULL DEFAULT false,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Page_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."GalleryAlbum" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "coverImageUrl" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GalleryAlbum_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."_NewsArticleToTag" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_NewsArticleToTag_AB_pkey" PRIMARY KEY ("A","B")
);

-- ---------------------------------------------------------------------------
-- Three-tier role model
--
-- ADMIN/MANAGER become SUPER_ADMIN/CONTENT_ADMIN. RENAME VALUE keeps existing
-- rows and their foreign keys intact. The new EDITOR value is added in a
-- separate migration because PostgreSQL cannot use a new enum label in the
-- transaction that introduces it.
-- ---------------------------------------------------------------------------

ALTER TYPE "UserRole" RENAME VALUE 'ADMIN' TO 'SUPER_ADMIN';
ALTER TYPE "UserRole" RENAME VALUE 'MANAGER' TO 'CONTENT_ADMIN';

-- ---------------------------------------------------------------------------
-- Audit log (replaces the unused ActivityLog table)
-- ---------------------------------------------------------------------------

-- CreateTable
CREATE TABLE "public"."AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "summary" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUCCESS',
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- Alter existing tables
-- ---------------------------------------------------------------------------

-- AlterTable
ALTER TABLE "ContactInquiry" ADD COLUMN "notes" TEXT;

-- AlterTable: added as nullable so existing rows survive, then backfilled.
ALTER TABLE "FaqItem" ADD COLUMN "updatedAt" TIMESTAMP(3);
UPDATE "FaqItem" SET "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL;
ALTER TABLE "FaqItem" ALTER COLUMN "updatedAt" SET NOT NULL;

-- AlterTable
ALTER TABLE "Service"
  ADD COLUMN "summary" TEXT,
  ADD COLUMN "content" TEXT,
  ADD COLUMN "imageUrl" TEXT,
  ADD COLUMN "imageAlt" TEXT,
  ADD COLUMN "category" TEXT,
  ADD COLUMN "slug" TEXT,
  ADD COLUMN "status" "ContentStatus" NOT NULL DEFAULT 'PUBLISHED',
  ADD COLUMN "publishedAt" TIMESTAMP(3),
  ADD COLUMN "deletedAt" TIMESTAMP(3);

-- Backfill slugs from the existing service titles so every program keeps a
-- working /programs/<slug> URL.
UPDATE "Service"
SET
  "slug" = LOWER(TRIM(REGEXP_REPLACE("title", '[^a-zA-Z0-9]+', '-', 'g'), '-')),
  "summary" = COALESCE(NULLIF("summary", ''), "tagline");

-- Disambiguate any slug collisions defensively (PostgreSQL needs the row number here).
UPDATE "Service" s
SET "slug" = s."slug" || '-' || dup.n
FROM (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY LOWER(TRIM(REGEXP_REPLACE("title", '[^a-zA-Z0-9]+', '-', 'g'), '-')) ORDER BY "createdAt") AS n
  FROM "Service"
) dup
WHERE s."id" = dup."id" AND dup.n > 1;

ALTER TABLE "Service" ALTER COLUMN "slug" SET NOT NULL;

-- Existing home-page services were live before the workflow existed, so they
-- start life published with their original created date.
UPDATE "Service"
SET "publishedAt" = "createdAt", "status" = 'PUBLISHED'
WHERE "publishedAt" IS NULL;

-- AlterTable
ALTER TABLE "Product"
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "displayOrder" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "StoreLocation"
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "displayOrder" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "LeadershipMember" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "SuccessStory"
  ADD COLUMN "authorName" TEXT,
  ADD COLUMN "authorRole" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN "lastLoginAt" TIMESTAMP(3);

-- AlterTable: gallery images become first-class editorial content with alt text,
-- albums, ordering and a publish workflow.
ALTER TABLE "GalleryImage"
  ADD COLUMN "thumbnailUrl" TEXT,
  ADD COLUMN "alt" TEXT,
  ADD COLUMN "description" TEXT,
  ADD COLUMN "displayOrder" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "albumId" TEXT,
  ADD COLUMN "projectId" TEXT,
  ADD COLUMN "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "publishedAt" TIMESTAMP(3),
  ADD COLUMN "deletedAt" TIMESTAMP(3);

-- Backfill: derive alt text from the existing caption so no image is ever
-- published without accessible text, and carry over the isPublished flag.
UPDATE "GalleryImage"
SET
  "alt" = COALESCE(NULLIF(TRIM("caption"), ''), 'Kalisizo Coffee cooperative photograph'),
  "status" = CASE WHEN "isPublished" THEN 'PUBLISHED'::"ContentStatus" ELSE 'DRAFT'::"ContentStatus" END,
  "publishedAt" = CASE WHEN "isPublished" THEN "createdAt" ELSE NULL END;

-- The legacy boolean is now represented by `status`, and the free-text category
-- is replaced by the album relation. Dropping each column also drops the index
-- that covered it, so no explicit DROP INDEX is needed here.
ALTER TABLE "GalleryImage" DROP COLUMN "isPublished";
ALTER TABLE "GalleryImage" DROP COLUMN "category";

-- Prisma owns `id` (cuid) and `updatedAt`; the database-level defaults are
-- legacy leftovers from before this table was in schema.prisma.
ALTER TABLE "GalleryImage"
  ALTER COLUMN "id" DROP DEFAULT,
  ALTER COLUMN "updatedAt" DROP DEFAULT;

-- `alt` is NOT NULL in the schema and every existing row has been backfilled
-- with a value, so the constraint can now be applied.
ALTER TABLE "GalleryImage" ALTER COLUMN "alt" SET NOT NULL;

-- ---------------------------------------------------------------------------
-- Migrate social URLs out of CooperativeInfo
-- ---------------------------------------------------------------------------

INSERT INTO "SocialLink" ("id", "platform", "handle", "url", "description", "displayOrder", "isActive", "createdAt", "updatedAt")
SELECT
  'social-youtube',
  'YouTube',
  '@muwongedeo2017',
  "socialYouTube",
  'Harvest stories, field tours and cooperative updates in video.',
  0,
  COALESCE("socialYouTube" IS NOT NULL AND "socialYouTube" <> '', false),
  "createdAt",
  "updatedAt"
FROM "CooperativeInfo" WHERE "socialYouTube" IS NOT NULL AND "socialYouTube" <> '';

INSERT INTO "SocialLink" ("id", "platform", "handle", "url", "description", "displayOrder", "isActive", "createdAt", "updatedAt")
SELECT
  'social-instagram',
  'Instagram',
  '@nakafeero',
  "socialInstagram",
  'Beautiful moments from our farms, farmers and the cooperative.',
  1,
  COALESCE("socialInstagram" IS NOT NULL AND "socialInstagram" <> '', false),
  "createdAt",
  "updatedAt"
FROM "CooperativeInfo" WHERE "socialInstagram" IS NOT NULL AND "socialInstagram" <> '';

INSERT INTO "SocialLink" ("id", "platform", "handle", "url", "description", "displayOrder", "isActive", "createdAt", "updatedAt")
SELECT
  'social-tiktok',
  'TikTok',
  '@kalisizocoffee',
  "socialTikTok",
  'Follow all official platforms for news, offers and farmer tips.',
  2,
  COALESCE("socialTikTok" IS NOT NULL AND "socialTikTok" <> '', false),
  "createdAt",
  "updatedAt"
FROM "CooperativeInfo" WHERE "socialTikTok" IS NOT NULL AND "socialTikTok" <> '';

ALTER TABLE "CooperativeInfo"
  DROP COLUMN "socialYouTube",
  DROP COLUMN "socialInstagram",
  DROP COLUMN "socialTikTok";

-- ---------------------------------------------------------------------------
-- Retire the unused ActivityLog table (superseded by AuditLog, which is the
-- table the application actually reads). Its login history is preserved as
-- AuditLog entries before the table is dropped.
-- ---------------------------------------------------------------------------

INSERT INTO "AuditLog" ("id", "actorId", "actorName", "action", "targetType", "targetId", "summary", "status", "createdAt")
SELECT
  a."id",
  a."userId",
  COALESCE(u."name", 'Unknown'),
  CASE WHEN a."action" = 'auth.login' THEN 'LOGIN' ELSE 'LOGOUT' END,
  'auth',
  NULL,
  'Legacy activity log entry: ' || a."action",
  'SUCCESS',
  a."createdAt"
FROM "ActivityLog" a
LEFT JOIN "User" u ON u."id" = a."userId";

ALTER TABLE "ActivityLog" DROP CONSTRAINT "ActivityLog_userId_fkey";
DROP TABLE "ActivityLog";

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

CREATE INDEX "AuditLog_targetType_targetId_idx" ON "AuditLog"("targetType", "targetId");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

CREATE INDEX "SiteSetting_group_idx" ON "SiteSetting"("group");
CREATE INDEX "SocialLink_displayOrder_idx" ON "SocialLink"("displayOrder");

CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");
CREATE INDEX "Category_displayOrder_idx" ON "Category"("displayOrder");
CREATE UNIQUE INDEX "Tag_slug_key" ON "Tag"("slug");

CREATE UNIQUE INDEX "NewsArticle_slug_key" ON "NewsArticle"("slug");
CREATE INDEX "NewsArticle_status_publishedAt_idx" ON "NewsArticle"("status", "publishedAt");
CREATE INDEX "NewsArticle_deletedAt_idx" ON "NewsArticle"("deletedAt");
CREATE INDEX "NewsArticle_categoryId_idx" ON "NewsArticle"("categoryId");

CREATE UNIQUE INDEX "Event_slug_key" ON "Event"("slug");
CREATE INDEX "Event_status_startAt_idx" ON "Event"("status", "startAt");
CREATE INDEX "Event_deletedAt_idx" ON "Event"("deletedAt");

CREATE UNIQUE INDEX "Project_slug_key" ON "Project"("slug");
CREATE INDEX "Project_status_stage_idx" ON "Project"("status", "stage");
CREATE INDEX "Project_deletedAt_idx" ON "Project"("deletedAt");

CREATE UNIQUE INDEX "Announcement_slug_key" ON "Announcement"("slug");
CREATE INDEX "Announcement_status_startsAt_idx" ON "Announcement"("status", "startsAt");
CREATE INDEX "Announcement_deletedAt_idx" ON "Announcement"("deletedAt");

CREATE UNIQUE INDEX "Publication_slug_key" ON "Publication"("slug");
CREATE INDEX "Publication_status_kind_idx" ON "Publication"("status", "kind");
CREATE INDEX "Publication_deletedAt_idx" ON "Publication"("deletedAt");

CREATE UNIQUE INDEX "Page_slug_key" ON "Page"("slug");
CREATE INDEX "Page_status_displayOrder_idx" ON "Page"("status", "displayOrder");
CREATE INDEX "Page_deletedAt_idx" ON "Page"("deletedAt");

CREATE UNIQUE INDEX "GalleryAlbum_slug_key" ON "GalleryAlbum"("slug");
CREATE INDEX "GalleryAlbum_displayOrder_idx" ON "GalleryAlbum"("displayOrder");

CREATE INDEX "GalleryImage_status_displayOrder_idx" ON "GalleryImage"("status", "displayOrder");
CREATE INDEX "GalleryImage_albumId_idx" ON "GalleryImage"("albumId");
CREATE INDEX "GalleryImage_projectId_idx" ON "GalleryImage"("projectId");
CREATE INDEX "GalleryImage_deletedAt_idx" ON "GalleryImage"("deletedAt");

CREATE INDEX "_NewsArticleToTag_B_index" ON "_NewsArticleToTag"("B");

CREATE INDEX "FaqItem_displayOrder_idx" ON "FaqItem"("displayOrder");
CREATE INDEX "Product_displayOrder_idx" ON "Product"("displayOrder");
CREATE INDEX "StoreLocation_displayOrder_idx" ON "StoreLocation"("displayOrder");
CREATE UNIQUE INDEX "Service_slug_key" ON "Service"("slug");
CREATE INDEX "Service_status_displayOrder_idx" ON "Service"("status", "displayOrder");
CREATE INDEX "Service_deletedAt_idx" ON "Service"("deletedAt");
CREATE INDEX "User_isActive_idx" ON "User"("isActive");

-- ---------------------------------------------------------------------------
-- Foreign keys
-- ---------------------------------------------------------------------------

ALTER TABLE "NewsArticle" ADD CONSTRAINT "NewsArticle_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "NewsArticle" ADD CONSTRAINT "NewsArticle_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GalleryImage" ADD CONSTRAINT "GalleryImage_albumId_fkey" FOREIGN KEY ("albumId") REFERENCES "GalleryAlbum"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GalleryImage" ADD CONSTRAINT "GalleryImage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "_NewsArticleToTag" ADD CONSTRAINT "_NewsArticleToTag_A_fkey" FOREIGN KEY ("A") REFERENCES "NewsArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_NewsArticleToTag" ADD CONSTRAINT "_NewsArticleToTag_B_fkey" FOREIGN KEY ("B") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
