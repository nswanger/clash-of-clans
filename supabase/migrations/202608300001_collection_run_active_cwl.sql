-- The collector observes whether a CWL season is running on every collection run:
-- a 200 from currentwar/leaguegroup means a season is live, and the 404 that endpoint
-- returns between seasons is Clash confirming there is none. Recording that observation
-- on the run keeps the answer where it was made. Readers previously re-derived it from
-- the newest successful league_group snapshot, which between seasons is the last one of
-- the *previous* CWL, so the derived answer stayed "active" indefinitely.

alter table public.collection_runs
  add column if not exists active_cwl boolean;

comment on column public.collection_runs.active_cwl is
  'Whether a CWL season was live when this run observed it: true in season, false when the Clash API confirmed no league group, null when the run could not tell (transient failure). Never infer this from raw_snapshots.';
