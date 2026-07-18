CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.configure_raw_snapshot_retention_cron()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    existing_job_id bigint;
    scheduled_job_id bigint;
BEGIN
    FOR existing_job_id IN
        SELECT cron.job.jobid
        FROM cron.job
        WHERE cron.job.jobname = 'purge-expired-raw-snapshots'
    LOOP
        PERFORM cron.unschedule(existing_job_id);
    END LOOP;

    SELECT cron.schedule(
        'purge-expired-raw-snapshots',
        '17 3 * * *',
        'SELECT public.purge_expired_raw_snapshots();'
    )
    INTO scheduled_job_id;

    RETURN scheduled_job_id;
END;
$$;

REVOKE ALL ON FUNCTION public.configure_raw_snapshot_retention_cron() FROM PUBLIC;

COMMENT ON FUNCTION public.configure_raw_snapshot_retention_cron() IS
    'Idempotently configures the production-only daily raw snapshot retention job.';
