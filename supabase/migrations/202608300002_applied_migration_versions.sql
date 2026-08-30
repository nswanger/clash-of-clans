-- #81: the collector deploys by hand from UnRaid and nothing checks the schema
-- before the new image starts. A collector calling a database function the
-- remote schema does not have fails its normalized writes while still reporting
-- healthy Clash attempts, so the failure is quiet: a working-looking collector
-- that records nothing.
--
-- The guard is the same comparison scripts/check-migrations.sh makes for the
-- Pages path -- local migration versions against the ones the database reports
-- applied -- run by the collector against a manifest baked into its image. That
-- keeps it outbound-only: no inbound port, no CI reaching the server, and no
-- new credential, because the collector already authenticates as service_role.
--
-- supabase_migrations is not an exposed schema, so PostgREST cannot read the
-- ledger directly. This function is the seam. It returns the same single column
-- migration_auditor is limited to (#65): version names, which are filenames
-- already visible in this public repository. It deliberately does not expose
-- `statements`, which holds the full DDL text of every migration ever applied.
create or replace function public.applied_migration_versions()
returns setof text
language sql
security definer
set search_path = ''
stable
as $$
  select version
  from supabase_migrations.schema_migrations
  order by version
$$;

comment on function public.applied_migration_versions() is
  'Migration versions the database reports applied, for the collector schema guard (#81). Returns version names only, never migration DDL.';

-- Least privilege: only the collector's role needs this. anon and authenticated
-- get nothing, so the browser app cannot enumerate the ledger.
revoke all on function public.applied_migration_versions() from public;
grant execute on function public.applied_migration_versions() to service_role;
