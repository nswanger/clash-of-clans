begin;

create extension if not exists pgtap with schema extensions;

select plan(18);

select has_table('public', 'cwl_seasons', 'CWL seasons table exists');
select col_is_unique('public', 'cwl_seasons', array['clan_tag', 'season_id'], 'season identity is unique');
select col_is_unique('public', 'cwl_wars', array['war_tag'], 'war tag is unique');
select col_is_unique('public', 'cwl_war_members', array['war_tag', 'player_tag'], 'war membership identity is unique');
select col_is_unique('public', 'cwl_attacks', array['war_tag', 'attacker_tag', 'attack_order'], 'attack identity is unique');
select col_is_unique('public', 'raw_snapshots', array['endpoint', 'request_identity', 'content_sha256'], 'snapshot fingerprint identity is unique');
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

select * from finish();
rollback;
