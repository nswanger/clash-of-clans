begin;

create extension if not exists pgtap with schema extensions;

select plan(27);

select has_table('public', 'cwl_seasons', 'CWL seasons table exists');
select col_is_unique('public', 'cwl_seasons', array['clan_tag', 'season_id'], 'season identity is unique');
select col_is_pk('public', 'cwl_wars', array['war_tag'], 'war tag is the primary identity');
select col_is_pk('public', 'cwl_war_members', array['war_tag', 'player_tag'], 'war membership is the primary identity');
select col_is_pk('public', 'cwl_attacks', array['war_tag', 'attacker_tag', 'attack_order'], 'attack is the primary identity');
select col_is_unique('public', 'raw_snapshots', array['endpoint', 'request_identity', 'content_sha256'], 'snapshot fingerprint identity is unique');
select has_table('public', 'clan_roster_daily_observations', 'daily roster observation table exists');
select has_table('public', 'member_daily_snapshots', 'daily member snapshot table exists');
select col_is_pk('public', 'clan_roster_daily_observations', array['clan_tag', 'observed_on'], 'daily roster grain is canonical');
select col_is_pk('public', 'member_daily_snapshots', array['clan_tag', 'observed_on', 'player_tag'], 'daily member grain is canonical');
select has_function('public', 'apply_member_roster_daily', array['text', 'date', 'timestamp with time zone', 'uuid', 'jsonb'], 'roster normalization function exists');
select has_function('public', 'apply_member_profile_daily', array['text', 'date', 'text', 'timestamp with time zone', 'uuid', 'jsonb'], 'profile normalization function exists');
select col_is_unique('public', 'invitations', array['token_hash'], 'invitation token hash is unique');

insert into cwl_seasons (clan_tag, season_id, war_size, target_core_size, rotation_positions)
values ('#CLAN', '2026-07', 15, 10, 5);

insert into cwl_wars (war_tag, clan_tag, season_id, war_day, state)
values ('#WAR', '#CLAN', '2026-07', 1, 'warEnded');

insert into cwl_members (clan_tag, season_id, player_tag, name, town_hall_level)
values ('#CLAN', '2026-07', '#PLAYER', 'Fixture Player', 17);

insert into cwl_war_members (war_tag, player_tag, map_position)
values ('#WAR', '#PLAYER', 1);

select lives_ok($$
  insert into cwl_attacks (war_tag, attacker_tag, attack_order, stars, destruction)
  values ('#WAR', '#PLAYER', 1, 2, 77.5)
  on conflict (war_tag, attacker_tag, attack_order)
  do update set stars = excluded.stars, destruction = excluded.destruction
$$, 'canonical attack upsert succeeds');

select lives_ok($$
  insert into cwl_attacks (war_tag, attacker_tag, attack_order, stars, destruction)
  values ('#WAR', '#PLAYER', 1, 3, 100)
  on conflict (war_tag, attacker_tag, attack_order)
  do update set stars = excluded.stars, destruction = excluded.destruction
$$, 'canonical attack retry succeeds');

select is(
  (select count(*) from cwl_attacks where war_tag = '#WAR' and attacker_tag = '#PLAYER'),
  1::bigint,
  'retry does not duplicate attacks'
);

select is(
  (select stars from cwl_attacks where war_tag = '#WAR' and attacker_tag = '#PLAYER'),
  3::smallint,
  'retry updates canonical attack facts'
);

insert into raw_snapshots (endpoint, request_identity, http_status, content_sha256, response_body)
values ('league-war', '#WAR', 200, repeat('a', 64), '{}'::jsonb);

select throws_ok(
  $$insert into raw_snapshots (endpoint, request_identity, http_status, content_sha256, response_body)
    values ('league-war', '#WAR', 200, repeat('a', 64), '{}'::jsonb)$$,
  '23505',
  null,
  'duplicate raw snapshot fingerprint is rejected'
);

select lives_ok($$select purge_expired_raw_snapshots()$$, 'retention function is callable');
select function_returns('public', 'purge_expired_raw_snapshots', array[]::text[], 'bigint', 'retention function reports deleted rows');
select has_table('public', 'collection_runs', 'collection runs table exists');
select has_table('public', 'collection_attempts', 'collection attempts table exists');
select has_table('public', 'recommendations', 'recommendations table exists');
select has_table('public', 'leader_decisions', 'leader decisions table exists');

select throws_ok(
  $$delete from cwl_seasons where clan_tag = '#CLAN' and season_id = '2026-07'$$,
  '23503', null, 'season deletion cannot cascade away canonical facts'
);
select throws_ok(
  $$delete from cwl_wars where war_tag = '#WAR'$$,
  '23503', null, 'war deletion cannot cascade away canonical facts'
);

insert into auth.users (id, email, raw_user_meta_data)
values ('00000000-0000-0000-0000-000000000010', 'decision-actor@example.test', '{}');
insert into recommendations (id, clan_tag, season_id, war_tag, strategy_version, input, output)
values ('00000000-0000-0000-0000-000000000020', '#CLAN', '2026-07', '#WAR', 'test-v1', '{}', '{}');
insert into leader_decisions (recommendation_id, status, final_changes, actor_id)
values ('00000000-0000-0000-0000-000000000020', 'approved', '[]', '00000000-0000-0000-0000-000000000010');
select throws_ok(
  $$delete from recommendations where id = '00000000-0000-0000-0000-000000000020'$$,
  '23503', null, 'recommendation deletion cannot remove decision history'
);

select * from finish();
rollback;
