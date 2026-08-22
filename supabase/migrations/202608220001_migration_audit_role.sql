-- #65: Pages deploys itself and the database does not, so a commit that merges
-- a migration and a surface reading it ships the surface immediately and the
-- schema never. Observed 2026-08-20 with 202608200001_cwl_bonus_administration.
-- The runbook rule that would have caught it (`supabase migration list` before
-- merging) existed for the collector and had no counterpart for the web app.
--
-- CI can only enforce that rule if it can see which migrations the remote
-- database has actually applied. The obvious way -- `supabase migration list
-- --linked` -- authenticates with SUPABASE_ACCESS_TOKEN, a personal access
-- token that is account-wide: Supabase scopes OAuth apps, not PATs. That is a
-- strictly more privileged credential than the service-role key the Pages
-- artifact scan exists to keep out, so it is not going anywhere near Actions.
--
-- This role is the alternative. The migration ledger is an ordinary table, so a
-- login role that can read two of its columns and nothing else answers the
-- question with a credential whose worst-case disclosure is the list of
-- migration filenames already visible in this repository.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'migration_auditor') THEN
        -- NOLOGIN here and in every local database. The password is set once
        -- against production by hand (supabase/production/enable_migration_auditor_login.sql)
        -- so no credential is ever committed, and a local `supabase db reset`
        -- cannot produce a role anything can authenticate as.
        CREATE ROLE migration_auditor NOLOGIN;
    END IF;
END
$$;

-- No explicit CONNECT grant: PUBLIC holds CONNECT on the database by default,
-- and asking `postgres` to grant a database-level privilege it may not hold
-- WITH GRANT OPTION would fail the migration for no gain.
GRANT USAGE ON SCHEMA supabase_migrations TO migration_auditor;

-- Column-level, deliberately. `statements` holds the full DDL text of every
-- migration ever applied; the check needs only to know which versions are
-- present, so the role is never able to read what they did.
GRANT SELECT (version, name) ON supabase_migrations.schema_migrations TO migration_auditor;

-- No REVOKE on schema `public`. It is tempting, and it would be a no-op: the
-- USAGE this role has there is held by the PUBLIC pseudo-role, so revoking from
-- `migration_auditor` removes nothing, and `REVOKE ... FROM PUBLIC` would
-- change the privileges of every role in the database to protect one. Verified
-- against the local stack: has_schema_privilege(...,'public','USAGE') stays
-- true after the revoke, which is why the statement is gone rather than kept
-- as reassurance.
--
-- USAGE on a schema only resolves names; it reads nothing. What actually keeps
-- application data out of reach is that every table in `public` grants solely
-- to anon/authenticated/service_role and carries RLS besides, so
-- has_table_privilege(...,'public.cwl_seasons','SELECT') is false for this role.

-- No COMMENT ON ROLE: commenting on a role requires superuser, which the
-- migration runner is not. What the role is for lives in this file's header and
-- in docs/runbooks/supabase.md.
