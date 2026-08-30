BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(7);

SELECT has_function(
    'public',
    'applied_migration_versions',
    'the collector schema guard can read the applied ledger (#81)'
);

SELECT is(
    (SELECT prosecdef FROM pg_proc WHERE oid = 'public.applied_migration_versions()'::regprocedure),
    true,
    'security definer, because supabase_migrations is not reachable by service_role directly'
);

SELECT is(
    (SELECT proconfig FROM pg_proc WHERE oid = 'public.applied_migration_versions()'::regprocedure),
    ARRAY['search_path=""'],
    'an empty search_path, so a definer function cannot be captured by a shadowed name'
);

-- Least privilege. The browser app authenticates as anon or authenticated and has no
-- business enumerating the migration ledger; only the collector's role needs this.
SELECT ok(
    has_function_privilege('service_role', 'public.applied_migration_versions()', 'EXECUTE'),
    'the collector role can read the ledger'
);
SELECT ok(
    NOT has_function_privilege('anon', 'public.applied_migration_versions()', 'EXECUTE'),
    'anon cannot read the ledger'
);
SELECT ok(
    NOT has_function_privilege('authenticated', 'public.applied_migration_versions()', 'EXECUTE'),
    'authenticated cannot read the ledger'
);

-- It answers with this database's own applied versions, which is what the collector
-- compares its baked manifest against.
SELECT ok(
    (SELECT count(*) FROM public.applied_migration_versions()) = (
        SELECT count(*) FROM supabase_migrations.schema_migrations
    ),
    'every applied migration version is reported'
);

SELECT * FROM finish();
ROLLBACK;
