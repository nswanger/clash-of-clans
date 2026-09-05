-- The collector status board and the operator role (#117).
--
-- `operator` decides who sees the Collector section of Admin and is the check any
-- future write against the collector (a rerun, a schedule change) must pass. It is
-- additive: `is_leader()` is untouched, so an account holding only `operator` is
-- denied at sign-in. Nick holds it beside `admin`; the clan leader holds `admin`
-- alone. Inserted by hand as bootstrap SQL (docs/runbooks/supabase.md), never here.
--
-- `next_run_at` is the one fact the board needs that the collector knew and never
-- persisted: the scheduler computed it and slept.
alter type public.app_role add value if not exists 'operator';

alter table public.collection_runs
  add column if not exists next_run_at timestamptz;

comment on column public.collection_runs.next_run_at is
  'When the collector scheduled its next run after this one finished; null while running or if the run crashed (#117).';
