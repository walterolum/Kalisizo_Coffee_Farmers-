-- Introduce the EDITOR role.
--
-- PostgreSQL cannot use a new enum label within the transaction that adds it,
-- so this must run as its own migration immediately after `content_workflow`.
-- The guard makes it safe to re-run after a partial failure, which is the
-- situation a production operator is most likely to hit here.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'UserRole' AND e.enumlabel = 'EDITOR'
  ) THEN
    ALTER TYPE "UserRole" ADD VALUE 'EDITOR';
  END IF;
END
$$;
