create table public.clan_roster_daily_observations (
  clan_tag text not null check (btrim(clan_tag) <> ''),
  observed_on date not null,
  roster_observed_at timestamptz not null,
  collection_run_id uuid not null references public.collection_runs(id) on delete restrict,
  member_count smallint not null check (member_count between 0 and 50),
  primary key (clan_tag, observed_on),
  check ((roster_observed_at at time zone 'UTC')::date = observed_on)
);

create table public.member_daily_snapshots (
  clan_tag text not null,
  observed_on date not null,
  player_tag text not null check (btrim(player_tag) <> ''),
  name text not null check (btrim(name) <> ''),
  role text check (role is null or btrim(role) <> ''),
  clan_rank smallint check (clan_rank is null or clan_rank > 0),
  previous_clan_rank smallint check (previous_clan_rank is null or previous_clan_rank > 0),
  town_hall_level smallint not null check (town_hall_level > 0),
  trophies integer check (trophies is null or trophies >= 0),
  league_id bigint check (league_id is null or league_id > 0),
  league_name text check (league_name is null or btrim(league_name) <> ''),
  donations integer check (donations is null or donations >= 0),
  donations_received integer check (donations_received is null or donations_received >= 0),
  war_preference text check (war_preference is null or btrim(war_preference) <> ''),
  war_stars integer check (war_stars is null or war_stars >= 0),
  attack_wins integer check (attack_wins is null or attack_wins >= 0),
  defense_wins integer check (defense_wins is null or defense_wins >= 0),
  clan_capital_contributions bigint check (clan_capital_contributions is null or clan_capital_contributions >= 0),
  clan_games_points bigint check (clan_games_points is null or clan_games_points >= 0),
  roster_observed_at timestamptz not null,
  profile_observed_at timestamptz,
  profile_collection_run_id uuid references public.collection_runs(id) on delete restrict,
  primary key (clan_tag, observed_on, player_tag),
  foreign key (clan_tag, observed_on)
    references public.clan_roster_daily_observations(clan_tag, observed_on)
    on update restrict on delete restrict,
  check ((roster_observed_at at time zone 'UTC')::date = observed_on),
  check (profile_observed_at is null or (profile_observed_at at time zone 'UTC')::date = observed_on),
  check ((profile_observed_at is null) = (profile_collection_run_id is null))
);

create index member_daily_snapshots_player_history_idx
  on public.member_daily_snapshots (clan_tag, player_tag, observed_on desc);

create index member_daily_snapshots_roster_idx
  on public.member_daily_snapshots (clan_tag, observed_on desc);

comment on table public.clan_roster_daily_observations is
  'Indefinitely retained proof that a complete clan roster was successfully observed on a UTC date.';
comment on table public.member_daily_snapshots is
  'Indefinitely retained daily member facts. These support observed activity evidence, not a claimed last-active time.';

create or replace function public.apply_member_roster_daily(
  p_clan_tag text,
  p_observed_on date,
  p_roster_observed_at timestamptz,
  p_collection_run_id uuid,
  p_members jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  incoming_count integer;
begin
  if jsonb_typeof(p_members) <> 'array' then
    raise exception 'Member roster payload must be a JSON array';
  end if;

  incoming_count := jsonb_array_length(p_members);
  if incoming_count > 50 then
    raise exception 'Member roster payload exceeds the 50-member clan limit';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_members) as member(player_tag text)
    group by member.player_tag
    having member.player_tag is null or btrim(member.player_tag) = '' or count(*) > 1
  ) then
    raise exception 'Member roster payload contains a missing or duplicate player tag';
  end if;

  insert into public.clan_roster_daily_observations (
    clan_tag, observed_on, roster_observed_at, collection_run_id, member_count
  ) values (
    p_clan_tag, p_observed_on, p_roster_observed_at, p_collection_run_id, incoming_count
  )
  on conflict (clan_tag, observed_on) do update set
    roster_observed_at = excluded.roster_observed_at,
    collection_run_id = excluded.collection_run_id,
    member_count = excluded.member_count
  where excluded.roster_observed_at >= public.clan_roster_daily_observations.roster_observed_at;

  if not exists (
    select 1
    from public.clan_roster_daily_observations observation
    where observation.clan_tag = p_clan_tag
      and observation.observed_on = p_observed_on
      and observation.roster_observed_at = p_roster_observed_at
      and observation.collection_run_id = p_collection_run_id
  ) then
    return incoming_count;
  end if;

  insert into public.member_daily_snapshots (
    clan_tag, observed_on, player_tag, name, role, clan_rank, previous_clan_rank,
    town_hall_level, trophies, league_id, league_name, donations, donations_received,
    roster_observed_at
  )
  select
    p_clan_tag, p_observed_on, member.player_tag, member.name, member.role,
    member.clan_rank, member.previous_clan_rank, member.town_hall_level,
    member.trophies, member.league_id, member.league_name, member.donations,
    member.donations_received, p_roster_observed_at
  from jsonb_to_recordset(p_members) as member(
    player_tag text,
    name text,
    role text,
    clan_rank smallint,
    previous_clan_rank smallint,
    town_hall_level smallint,
    trophies integer,
    league_id bigint,
    league_name text,
    donations integer,
    donations_received integer
  )
  on conflict (clan_tag, observed_on, player_tag) do update set
    name = excluded.name,
    role = excluded.role,
    clan_rank = excluded.clan_rank,
    previous_clan_rank = excluded.previous_clan_rank,
    town_hall_level = excluded.town_hall_level,
    trophies = excluded.trophies,
    league_id = excluded.league_id,
    league_name = excluded.league_name,
    donations = excluded.donations,
    donations_received = excluded.donations_received,
    roster_observed_at = excluded.roster_observed_at;

  delete from public.member_daily_snapshots stored
  where stored.clan_tag = p_clan_tag
    and stored.observed_on = p_observed_on
    and not exists (
      select 1
      from jsonb_to_recordset(p_members) as member(player_tag text)
      where member.player_tag = stored.player_tag
    );

  return incoming_count;
end;
$$;

create or replace function public.apply_member_profile_daily(
  p_clan_tag text,
  p_observed_on date,
  p_player_tag text,
  p_profile_observed_at timestamptz,
  p_collection_run_id uuid,
  p_profile jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_count integer;
begin
  update public.member_daily_snapshots snapshot set
    war_preference = nullif(p_profile ->> 'war_preference', ''),
    war_stars = nullif(p_profile ->> 'war_stars', '')::integer,
    attack_wins = nullif(p_profile ->> 'attack_wins', '')::integer,
    defense_wins = nullif(p_profile ->> 'defense_wins', '')::integer,
    clan_capital_contributions = nullif(p_profile ->> 'clan_capital_contributions', '')::bigint,
    clan_games_points = nullif(p_profile ->> 'clan_games_points', '')::bigint,
    profile_observed_at = p_profile_observed_at,
    profile_collection_run_id = p_collection_run_id
  where snapshot.clan_tag = p_clan_tag
    and snapshot.observed_on = p_observed_on
    and snapshot.player_tag = p_player_tag
    and (snapshot.profile_observed_at is null or snapshot.profile_observed_at <= p_profile_observed_at);

  get diagnostics updated_count = row_count;
  return updated_count = 1;
end;
$$;

revoke all on function public.apply_member_roster_daily(text, date, timestamptz, uuid, jsonb) from public;
revoke all on function public.apply_member_profile_daily(text, date, text, timestamptz, uuid, jsonb) from public;
grant execute on function public.apply_member_roster_daily(text, date, timestamptz, uuid, jsonb) to service_role;
grant execute on function public.apply_member_profile_daily(text, date, text, timestamptz, uuid, jsonb) to service_role;

alter table public.clan_roster_daily_observations enable row level security;
alter table public.member_daily_snapshots enable row level security;

create policy "Leaders read roster observations"
  on public.clan_roster_daily_observations for select to authenticated
  using (public.is_leader());
create policy "Leaders read member history"
  on public.member_daily_snapshots for select to authenticated
  using (public.is_leader());

create or replace view public.member_roster_overview
with (security_invoker = true) as
with latest_roster as (
  select distinct on (clan_tag)
    clan_tag,
    observed_on,
    roster_observed_at
  from public.clan_roster_daily_observations
  order by clan_tag, observed_on desc
),
player_history as (
  select
    clan_tag,
    player_tag,
    min(observed_on) as first_observed_present_on,
    max(observed_on) as last_observed_present_on
  from public.member_daily_snapshots
  group by clan_tag, player_tag
),
latest_member as (
  select distinct on (clan_tag, player_tag)
    snapshot.*
  from public.member_daily_snapshots snapshot
  order by clan_tag, player_tag, observed_on desc
)
select
  latest_member.clan_tag,
  latest_member.player_tag,
  latest_member.name,
  latest_member.role,
  latest_member.clan_rank,
  latest_member.previous_clan_rank,
  latest_member.town_hall_level,
  latest_member.trophies,
  latest_member.league_id,
  latest_member.league_name,
  latest_member.donations,
  latest_member.donations_received,
  latest_member.war_preference,
  latest_member.war_stars,
  latest_member.attack_wins,
  latest_member.defense_wins,
  latest_member.clan_capital_contributions,
  latest_member.clan_games_points,
  latest_member.roster_observed_at,
  latest_member.profile_observed_at,
  player_history.first_observed_present_on,
  player_history.last_observed_present_on,
  latest_member.observed_on = latest_roster.observed_on as is_current_member,
  case when latest_member.observed_on = latest_roster.observed_on then (
    select min(presence.observed_on)
    from public.member_daily_snapshots presence
    where presence.clan_tag = latest_member.clan_tag
      and presence.player_tag = latest_member.player_tag
      and presence.observed_on > coalesce((
        select max(absence.observed_on)
        from public.clan_roster_daily_observations absence
        where absence.clan_tag = latest_member.clan_tag
          and absence.observed_on < latest_roster.observed_on
          and not exists (
            select 1
            from public.member_daily_snapshots absent_member
            where absent_member.clan_tag = absence.clan_tag
              and absent_member.observed_on = absence.observed_on
              and absent_member.player_tag = latest_member.player_tag
          )
      ), '-infinity'::date)
  ) end as current_presence_started_on,
  case when latest_member.observed_on < latest_roster.observed_on then (
    select min(observation.observed_on)
    from public.clan_roster_daily_observations observation
    where observation.clan_tag = latest_member.clan_tag
      and observation.observed_on > latest_member.observed_on
  ) end as departure_observed_on,
  baseline_1d.snapshot as baseline_1d,
  baseline_7d.snapshot as baseline_7d,
  baseline_30d.snapshot as baseline_30d
from latest_member
join latest_roster using (clan_tag)
join player_history using (clan_tag, player_tag)
left join lateral (
  select jsonb_build_object(
    'observed_on', baseline.observed_on,
    'role', baseline.role,
    'town_hall_level', baseline.town_hall_level,
    'trophies', baseline.trophies,
    'league_id', baseline.league_id,
    'donations', baseline.donations,
    'donations_received', baseline.donations_received,
    'war_preference', baseline.war_preference,
    'attack_wins', baseline.attack_wins,
    'defense_wins', baseline.defense_wins,
    'clan_capital_contributions', baseline.clan_capital_contributions,
    'clan_games_points', baseline.clan_games_points
  ) as snapshot
  from public.member_daily_snapshots baseline
  where baseline.clan_tag = latest_member.clan_tag
    and baseline.player_tag = latest_member.player_tag
    and baseline.observed_on <= latest_member.observed_on - 1
  order by baseline.observed_on desc
  limit 1
) baseline_1d on true
left join lateral (
  select jsonb_build_object(
    'observed_on', baseline.observed_on,
    'role', baseline.role,
    'town_hall_level', baseline.town_hall_level,
    'trophies', baseline.trophies,
    'league_id', baseline.league_id,
    'donations', baseline.donations,
    'donations_received', baseline.donations_received,
    'war_preference', baseline.war_preference,
    'attack_wins', baseline.attack_wins,
    'defense_wins', baseline.defense_wins,
    'clan_capital_contributions', baseline.clan_capital_contributions,
    'clan_games_points', baseline.clan_games_points
  ) as snapshot
  from public.member_daily_snapshots baseline
  where baseline.clan_tag = latest_member.clan_tag
    and baseline.player_tag = latest_member.player_tag
    and baseline.observed_on <= latest_member.observed_on - 7
  order by baseline.observed_on desc
  limit 1
) baseline_7d on true
left join lateral (
  select jsonb_build_object(
    'observed_on', baseline.observed_on,
    'role', baseline.role,
    'town_hall_level', baseline.town_hall_level,
    'trophies', baseline.trophies,
    'league_id', baseline.league_id,
    'donations', baseline.donations,
    'donations_received', baseline.donations_received,
    'war_preference', baseline.war_preference,
    'attack_wins', baseline.attack_wins,
    'defense_wins', baseline.defense_wins,
    'clan_capital_contributions', baseline.clan_capital_contributions,
    'clan_games_points', baseline.clan_games_points
  ) as snapshot
  from public.member_daily_snapshots baseline
  where baseline.clan_tag = latest_member.clan_tag
    and baseline.player_tag = latest_member.player_tag
    and baseline.observed_on <= latest_member.observed_on - 30
  order by baseline.observed_on desc
  limit 1
) baseline_30d on true;

grant select on public.member_roster_overview to authenticated;
