-- Move the default CMS role to EDITOR.
--
-- Split from `add_editor_role` because PostgreSQL requires the ADD VALUE
-- transaction to commit before the new label can be referenced. A newly
-- created CMS user therefore cannot publish or delete content until a Super
-- Administrator promotes them, which is the safe default.

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'EDITOR';
