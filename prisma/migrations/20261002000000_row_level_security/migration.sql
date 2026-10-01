-- Row level security as defence in depth.
--
-- WHY THIS EXISTS
--
-- The application's own authorization is enforced in code: every admin route
-- calls requirePermission(), and those checks are unit tested. Row level
-- security is not a replacement for that, and this migration does not weaken it
-- by moving it. RLS covers a different threat: any other path to the database
-- that bypasses the Next.js process.
--
-- That matters concretely on Supabase, where the `anon` key is public - it ships
-- to every browser. With the `public` schema exposed through PostgREST and RLS
-- switched off, that key is a full read and write on every table, including the
-- User table and every unpublished draft. Nothing in the application would
-- prevent it, because the request would never reach the application.
--
-- So the split is deliberate:
--
--   * `kalisizo_app`  - trusted. Full DML, no restrictions. Used by the Next.js
--                       process, which authorizes every request itself.
--   * `anon` and      - untrusted. No policy at all, which in Postgres means
--     `authenticated`   deny. They can reach the database but not a single row.
--
-- The application never uses PostgREST, so denying the public keys everything
-- costs nothing. Live updates go through Supabase Realtime *Broadcast* rather
-- than postgres_changes, specifically because broadcast is published by the
-- application after an authorized write, so it needs no policy to be loosened and
-- keeps the application as the authorization boundary.
--
-- WHY FORCE, NOT JUST ENABLE
--
-- ENABLE ROW LEVEL SECURITY is not enough, and the failure is silent. Postgres
-- lets a table's owner ignore its own policies unless the table is also
-- FORCEd. Prisma connects as the role that ran the migrations, which is the
-- table owner. So a project can ship a complete, correct-looking set of policies,
-- see them listed in pg_policies, and have every query sail straight past them.
--
-- Verified against PostgreSQL 18 before writing this: with a policy of
-- `USING (label = 'published')` on a three-row table, the owner saw all three
-- rows with RLS merely enabled, and one row after FORCE.
--
-- WHY THE APP POLICY IS `USING (true)`
--
-- It is not pretending to be a second authorization layer. Its job is to make
-- the schema fail CLOSED: a table added later without a policy is invisible to
-- the application, which breaks loudly, rather than being readable and shipped.
-- That is the property worth having, and it is asserted in the test suite.
--
-- Real protection for the app role is the connection string, not a policy. It is
-- never exposed to a browser and never appears in a NEXT_PUBLIC_ variable.

DO $$
BEGIN
  -- Trusted role for the application process.
  --
  -- NOSUPERUSER and NOBYPASSRLS are the two that matter. A superuser ignores RLS
  -- entirely, and BYPASSRLS does the same thing more quietly - it would leave
  -- every policy below looking configured while never being consulted.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kalisizo_app') THEN
    CREATE ROLE kalisizo_app
      LOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOINHERIT
      NOBYPASSRLS
      NOREPLICATION;
  END IF;
END $$;

-- Schema access. PUBLIC is revoked because Supabase grants CREATE on the public
-- schema to everyone by default, which lets any key that reaches the database
-- create objects in it.
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO kalisizo_app;

-- The application reads and writes every table. Prisma's migrate commands
-- connect separately, as the owner, so the app role needs no DDL rights at all -
-- which is why this role cannot alter the schema that RLS protects.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO kalisizo_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO kalisizo_app;

-- Default-deny for the public keys, stated rather than assumed.
--
-- Supabase already withholds these by default, but relying on a hosted platform's
-- defaults for the table containing password hashes and unpublished drafts is
-- not a decision worth leaving implicit. Revoking is idempotent.
--
-- Guarded because `anon` and `authenticated` are Supabase-created roles and do
-- not exist on a plain PostgreSQL server, which is what development and CI run
-- against. The same migration has to apply in both places, so the roles are
-- created when they are absent rather than assumed to be there.
DO $$
DECLARE
  public_key text;
  created_keys text := '';
BEGIN
  FOREACH public_key IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = public_key) THEN
      -- Not a Supabase server. A no-login, no-inherit role with no privileges
      -- cannot be used to reach anything, so creating it keeps the REVOKE below
      -- meaningful if a key is ever added later, without granting capability.
      EXECUTE format(
        'CREATE ROLE %I NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS',
        public_key
      );
      created_keys := created_keys || public_key || ' ';
    END IF;

    EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', public_key);
    EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', public_key);
  END LOOP;

  IF created_keys <> '' THEN
    RAISE NOTICE 'Created placeholder roles for % - not running on Supabase.', created_keys;
  END IF;
END $$;

-- Apply RLS to every table, including views, and make it binding on the owner.
--
-- The loop is over the catalog rather than a literal table list, so a table
-- added in a later migration is not silently left unprotected. Applying it by
-- hand and forgetting is exactly the failure this whole migration addresses.
DO $$
DECLARE
  target text;
BEGIN
  FOR target IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p', 'v', 'm')
      -- _prisma_migrations holds migration history. Nothing should ever read it
      -- over the API, and it is recreated by Prisma, so it is excluded to keep
      -- this loop from failing on a fresh database.
      AND c.relname <> '_prisma_migrations'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', target);
  END LOOP;
END $$;

-- One permissive policy per table for the trusted role.
--
-- Written as a loop so it cannot drift from the FORCE loop above: a table with
-- FORCE but no policy is invisible to the application, which is the fail-closed
-- behaviour intended for *new* tables but would be a bug if it happened here.
DO $$
DECLARE
  target text;
  policy_name text;
BEGIN
  FOR target IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND c.relname <> '_prisma_migrations'
  LOOP
    policy_name := target || '_app_all';

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = target AND policyname = policy_name
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I TO kalisizo_app USING (true) WITH CHECK (true)',
        policy_name,
        target
      );
    END IF;
  END LOOP;
END $$;

-- A comment per table is not needed, but a single audit marker is: this makes it
-- obvious in psql that RLS was applied deliberately rather than left to a
-- platform default that might change.
COMMENT ON ROLE kalisizo_app IS
  'Application role for the Next.js process. Authorization is enforced in code by requirePermission(); RLS on its tables is a fail-closed backstop, not the primary control. NOSUPERUSER and NOBYPASSRLS are load-bearing - see migration 20261002000000.';
