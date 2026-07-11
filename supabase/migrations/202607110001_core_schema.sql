create extension if not exists pgcrypto with schema extensions;

create type public.app_role as enum ('admin', 'leader');
create type public.availability_status as enum ('available', 'unavailable', 'unknown');
create type public.priority_mode as enum ('balanced', 'standings_first');
create type public.collection_status as enum ('running', 'healthy', 'partial', 'invalid_ip', 'error');
create type public.recommendation_status as enum ('proposed', 'approved', 'overridden', 'superseded');
create type public.decision_status as enum ('approved', 'overridden');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (btrim(display_name) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
      nullif(btrim(new.email), ''),
      new.id::text
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger create_profile_after_auth_signup
after insert on auth.users
for each row execute function public.handle_new_auth_user();

create table public.user_roles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  primary key (user_id, role)
);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  token_hash bytea not null unique check (octet_length(token_hash) = 32),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id),
  used_at timestamptz,
  used_by uuid references public.profiles(id),
  check ((used_at is null) = (used_by is null))
);

create table public.cwl_seasons (
  id uuid primary key default gen_random_uuid(),
  clan_tag text not null check (btrim(clan_tag) <> ''),
  season_id text not null check (btrim(season_id) <> ''),
  war_size smallint not null check (war_size in (15, 30)),
  target_core_size smallint not null check (target_core_size > 0),
  rotation_positions smallint not null check (rotation_positions >= 0),
  priority_mode public.priority_mode not null default 'balanced',
  eight_star_rotation_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clan_tag, season_id),
  check (target_core_size + rotation_positions = war_size)
);

create table public.cwl_members (
  clan_tag text not null,
  season_id text not null,
  player_tag text not null check (btrim(player_tag) <> ''),
  name text not null check (btrim(name) <> ''),
  town_hall_level smallint not null check (town_hall_level > 0),
  rostered_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (clan_tag, season_id, player_tag),
  foreign key (clan_tag, season_id) references public.cwl_seasons(clan_tag, season_id) on update restrict on delete cascade
);

create table public.cwl_wars (
  war_tag text primary key check (btrim(war_tag) <> ''),
  clan_tag text not null,
  season_id text not null,
  war_day smallint not null check (war_day > 0),
  state text not null check (btrim(state) <> ''),
  preparation_start_time timestamptz,
  start_time timestamptz,
  end_time timestamptz,
  opponent_tag text,
  attacks_per_member smallint not null default 1 check (attacks_per_member > 0),
  updated_at timestamptz not null default now(),
  unique (clan_tag, season_id, war_day),
  foreign key (clan_tag, season_id) references public.cwl_seasons(clan_tag, season_id) on update restrict on delete cascade
);

create table public.cwl_war_members (
  war_tag text not null references public.cwl_wars(war_tag) on update restrict on delete cascade,
  player_tag text not null check (btrim(player_tag) <> ''),
  map_position smallint not null check (map_position > 0),
  town_hall_level smallint check (town_hall_level > 0),
  assigned_attacks smallint not null default 1 check (assigned_attacks >= 0),
  primary key (war_tag, player_tag),
  unique (war_tag, map_position)
);

create table public.cwl_attacks (
  war_tag text not null,
  attacker_tag text not null,
  attack_order smallint not null check (attack_order > 0),
  defender_tag text,
  stars smallint not null check (stars between 0 and 3),
  destruction numeric(5,2) not null check (destruction between 0 and 100),
  duration_seconds integer check (duration_seconds >= 0),
  recorded_at timestamptz not null default now(),
  primary key (war_tag, attacker_tag, attack_order),
  foreign key (war_tag, attacker_tag) references public.cwl_war_members(war_tag, player_tag) on update restrict on delete cascade
);

create table public.collection_runs (
  id uuid primary key default gen_random_uuid(),
  status public.collection_status not null default 'running',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  last_fresh_at timestamptz,
  error_message text,
  check (finished_at is null or finished_at >= started_at)
);

create table public.collection_attempts (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.collection_runs(id) on delete cascade,
  endpoint text not null check (btrim(endpoint) <> ''),
  request_identity text not null check (btrim(request_identity) <> ''),
  attempt_number smallint not null default 1 check (attempt_number > 0),
  status public.collection_status not null,
  http_status smallint check (http_status between 100 and 599),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  error_category text,
  unique (run_id, endpoint, request_identity, attempt_number),
  check (finished_at is null or finished_at >= started_at)
);

create table public.raw_snapshots (
  id uuid primary key default gen_random_uuid(),
  collection_attempt_id uuid references public.collection_attempts(id) on delete set null,
  endpoint text not null check (btrim(endpoint) <> ''),
  request_identity text not null check (btrim(request_identity) <> ''),
  collected_at timestamptz not null default now(),
  http_status smallint not null check (http_status between 100 and 599),
  content_sha256 char(64) not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  response_body jsonb not null,
  normalized_at timestamptz,
  unique (endpoint, request_identity, content_sha256)
);

create index raw_snapshots_collected_at_idx on public.raw_snapshots (collected_at);

create table public.member_availability (
  id uuid primary key default gen_random_uuid(),
  clan_tag text not null,
  season_id text not null,
  player_tag text not null,
  status public.availability_status not null default 'unknown',
  note text,
  recorded_by uuid not null references public.profiles(id),
  recorded_at timestamptz not null default now(),
  unique (clan_tag, season_id, player_tag),
  foreign key (clan_tag, season_id, player_tag) references public.cwl_members(clan_tag, season_id, player_tag) on update restrict on delete cascade
);

create table public.recommendations (
  id uuid primary key default gen_random_uuid(),
  clan_tag text not null,
  season_id text not null,
  war_tag text references public.cwl_wars(war_tag) on update restrict on delete set null,
  strategy_version text not null check (btrim(strategy_version) <> ''),
  schema_version integer not null default 1 check (schema_version > 0),
  status public.recommendation_status not null default 'proposed',
  input jsonb not null,
  output jsonb not null,
  proposed_at timestamptz not null default now(),
  proposed_by uuid references public.profiles(id),
  superseded_at timestamptz,
  foreign key (clan_tag, season_id) references public.cwl_seasons(clan_tag, season_id) on update restrict on delete cascade
);

create table public.leader_decisions (
  id uuid primary key default gen_random_uuid(),
  recommendation_id uuid not null unique references public.recommendations(id) on delete cascade,
  status public.decision_status not null,
  schema_version integer not null default 1 check (schema_version > 0),
  final_changes jsonb not null,
  override_note text,
  actor_id uuid not null references public.profiles(id),
  decided_at timestamptz not null default now(),
  check (status <> 'overridden' or nullif(btrim(override_note), '') is not null)
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null check (btrim(event_type) <> ''),
  entity_type text not null check (btrim(entity_type) <> ''),
  entity_id text not null check (btrim(entity_id) <> ''),
  schema_version integer not null default 1 check (schema_version > 0),
  event_data jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

comment on column public.raw_snapshots.collected_at is 'UTC instant; raw API evidence is retained for 90 days.';
comment on table public.audit_events is 'Append-only application audit history retained indefinitely.';
