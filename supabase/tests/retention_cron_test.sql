BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(6);

SELECT has_extension('pg_cron', 'Supabase Cron is enabled');
SELECT has_function(
  'public',
  'configure_raw_snapshot_retention_cron',
  ARRAY[]::text[],
  'retention Cron configuration function exists'
);
SELECT lives_ok(
  $$SELECT public.configure_raw_snapshot_retention_cron()$$,
  'retention Cron can be configured repeatedly'
);
SELECT is(
  (
    SELECT count(*)
    FROM cron.job
    WHERE jobname = 'purge-expired-raw-snapshots'
  ),
  1::bigint,
  'retention scheduling is idempotent'
);
SELECT is(
  (
    SELECT cron.job.schedule
    FROM cron.job
    WHERE jobname = 'purge-expired-raw-snapshots'
  ),
  '17 3 * * *',
  'raw snapshot retention runs daily at 03:17 UTC'
);
SELECT ok(
  (
    SELECT cron.job.active
      AND cron.job.command = 'SELECT public.purge_expired_raw_snapshots();'
    FROM cron.job
    WHERE jobname = 'purge-expired-raw-snapshots'
  ),
  'the active Cron job calls only the protected retention function'
);

SELECT * FROM finish();
ROLLBACK;
