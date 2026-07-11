create or replace function public.purge_expired_raw_snapshots()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_count bigint;
begin
  delete from public.raw_snapshots
  where collected_at < now() - interval '90 days';

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.purge_expired_raw_snapshots() from public;
grant execute on function public.purge_expired_raw_snapshots() to service_role;

comment on function public.purge_expired_raw_snapshots() is
  'Deletes raw snapshots older than 90 days. In production, enable Supabase Cron and schedule this function daily; local migrations intentionally do not schedule it.';
