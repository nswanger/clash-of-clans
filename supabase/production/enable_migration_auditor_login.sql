-- Run once against production, in the SQL Editor, after 202608220001_migration_audit_role.sql
-- is applied. Replace <migration-auditor-password> with a freshly generated
-- value and store it in the password manager; the connection string built from
-- it becomes the SUPABASE_MIGRATION_AUDIT_URL repository secret (#65).
--
-- This is a credential bootstrap, not a schema change, which is why it lives
-- here rather than in a migration -- the same reason the first admin role
-- insert does. Committing a password to supabase/migrations would put it in
-- every clone and every local database.
--
-- The role's privileges come from the migration and are not repeated here.
-- LOGIN is the only thing production needs that local databases must not have.
ALTER ROLE migration_auditor WITH LOGIN PASSWORD '<migration-auditor-password>';

-- Verification, deliberately written so that nothing here can fail.
--
-- The obvious way to prove the role cannot read application data is to SET ROLE
-- and try -- but the SQL Editor submits this whole script as one statement
-- batch, so a permission-denied error would abort the batch and roll back the
-- ALTER ROLE above. You would be shown an error and left with no password set,
-- which is a worse outcome than not checking. has_*_privilege asks the same
-- question and answers it with a boolean.
--
-- Expected: can_log_in and can_read_version true, every other column false.
SELECT
    (SELECT rolcanlogin FROM pg_roles WHERE rolname = 'migration_auditor')
        AS can_log_in,
    has_column_privilege('migration_auditor', 'supabase_migrations.schema_migrations', 'version', 'SELECT')
        AS can_read_version,
    has_column_privilege('migration_auditor', 'supabase_migrations.schema_migrations', 'statements', 'SELECT')
        AS can_read_statements,
    has_table_privilege('migration_auditor', 'supabase_migrations.schema_migrations', 'UPDATE')
        AS can_write_ledger,
    has_table_privilege('migration_auditor', 'public.cwl_seasons', 'SELECT')
        AS can_read_seasons,
    has_table_privilege('migration_auditor', 'public.user_roles', 'SELECT')
        AS can_read_roles;
