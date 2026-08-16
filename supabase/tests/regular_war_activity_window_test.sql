begin;

create extension if not exists pgtap with schema extensions;

select plan(19);

select has_function(
  'public',
  'regular_war_member_activity_window',
  array['text', 'integer'],
  'windowed regular-war activity function exists'
);

insert into collection_runs (id, status, started_at, finished_at)
values ('00000000-0000-0000-0000-000000000340', 'healthy', now() - interval '1 hour', now() - interval '59 minutes');

-- #RECENT and #IDLE are on the observed roster; #GHOST never appeared in a
-- roster observation but did play in a war inside the window.
select is(
  apply_member_roster_daily(
    '#WINDOW',
    (now() at time zone 'utc')::date,
    now(),
    '00000000-0000-0000-0000-000000000340',
    '[{"player_tag":"#RECENT","name":"Recent","role":"member","clan_rank":1,"town_hall_level":17},
      {"player_tag":"#IDLE","name":"Idle","role":"member","clan_rank":2,"town_hall_level":16}]'
  ),
  2,
  'roster observation stores the members the window reports on'
);

insert into regular_wars (war_key, clan_tag, state, end_time, team_size, attacks_per_member, finalization_status)
values
  ('#WAR-RECENT', '#WINDOW', 'warEnded', now() - interval '2 days', 15, 2, 'complete_war_ended'),
  ('#WAR-PARTIAL', '#WINDOW', 'warEnded', now() - interval '3 days', 15, 1, 'incomplete'),
  ('#WAR-OLD', '#WINDOW', 'warEnded', now() - interval '20 days', 15, 2, 'complete_war_ended'),
  ('#WAR-UNDATED', '#WINDOW', 'warEnded', null, 15, 2, 'complete_war_ended');

insert into regular_war_members (war_key, player_tag, name, town_hall_level, assigned_attacks, attacks_made, stars)
values
  ('#WAR-RECENT', '#RECENT', 'Recent', 17, 2, 2, 5),
  ('#WAR-PARTIAL', '#RECENT', 'Recent', 17, 1, 1, 1),
  ('#WAR-OLD', '#RECENT', 'Recent', 17, 2, 0, 0),
  ('#WAR-UNDATED', '#RECENT', 'Recent', 17, 2, 2, 6),
  ('#WAR-OLD', '#IDLE', 'Idle', 16, 2, 2, 4),
  ('#WAR-RECENT', '#GHOST', 'Ghost', 15, 2, 1, 2);

select is(
  (select wars_observed from regular_war_member_activity_window('#WINDOW', 7) where player_tag = '#RECENT'),
  2,
  'the clan denominator covers the same window as participation'
);
select is(
  (select wars_participated from regular_war_member_activity_window('#WINDOW', 7) where player_tag = '#RECENT'),
  2,
  'participation counts only wars that ended inside the window'
);
select is(
  (select attacks_made from regular_war_member_activity_window('#WINDOW', 7) where player_tag = '#RECENT'),
  3,
  'attack usage sums the windowed wars'
);
select is(
  (select activity_score from regular_war_member_activity_window('#WINDOW', 7) where player_tag = '#RECENT'),
  100::numeric,
  'activity score is derived from the windowed sums'
);
select is(
  (select performance_score from regular_war_member_activity_window('#WINDOW', 7) where player_tag = '#RECENT'),
  67::numeric,
  'performance score stays a separate windowed measure'
);
select is(
  (select stars_per_attack from regular_war_member_activity_window('#WINDOW', 7) where player_tag = '#RECENT'),
  2.00::numeric,
  'stars per attack preserves the unrounded windowed context'
);
select is(
  (select incomplete_wars from regular_war_member_activity_window('#WINDOW', 7) where player_tag = '#RECENT'),
  1,
  'incomplete member evidence is reported inside the window'
);
select is(
  (select last_observed_at from regular_war_member_activity_window('#WINDOW', 7) where player_tag = '#RECENT'),
  (select end_time from regular_wars where war_key = '#WAR-RECENT'),
  'last observed war is the most recent war inside the window'
);

select is(
  (select wars_participated from regular_war_member_activity_window('#WINDOW', 7) where player_tag = '#IDLE'),
  0,
  'a member with no wars in the window reads as zero rather than a missing row'
);
select ok(
  (select activity_score is null from regular_war_member_activity_window('#WINDOW', 7) where player_tag = '#IDLE'),
  'no assigned attacks in the window leaves the score unknown rather than zero'
);
select is(
  (select wars_participated from regular_war_member_activity_window('#WINDOW', 7) where player_tag = '#GHOST'),
  1,
  'a war participant missing from roster observations is still reported'
);

select is(
  (select attacks_made from regular_war_member_activity_window('#WINDOW', 30) where player_tag = '#RECENT'),
  3,
  'an ended war with no recorded end time falls in no window'
);
select is(
  (select wars_participated from regular_war_member_activity_window('#WINDOW', 30) where player_tag = '#IDLE'),
  1,
  'a wider window reaches wars the shorter one excludes'
);

select throws_ok(
  $$select * from regular_war_member_activity_window('#WINDOW', 0)$$,
  '22023',
  'Activity window must be a positive number of days',
  'a non-positive window is rejected rather than silently empty'
);

-- The function is security invoker, so leader-only reads on regular wars and
-- roster snapshots are what gate it. Nothing about the window changes that.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000341', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'window-leader@example.test', '', now(), '{}', '{}'),
  ('00000000-0000-0000-0000-000000000342', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'window-member@example.test', '', now(), '{}', '{}');
insert into profiles (id, display_name) values
  ('00000000-0000-0000-0000-000000000341', 'Window Leader'),
  ('00000000-0000-0000-0000-000000000342', 'Window Member')
on conflict (id) do update set display_name = excluded.display_name;
insert into user_roles (user_id, role) values ('00000000-0000-0000-0000-000000000341', 'leader');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000341', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (select wars_participated from regular_war_member_activity_window('#WINDOW', 7) where player_tag = '#RECENT'),
  2,
  'a leader reads windowed activity'
);

select is(
  (select count(*)::integer from member_roster_overview where clan_tag = '#WINDOW'),
  2,
  'a leader can read the roster view the window joins to'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000342', true);
select is(
  (select count(*)::integer from regular_war_member_activity_window('#WINDOW', 7)),
  0,
  'a non-leader reads nothing through the window'
);
reset role;

select * from finish();
rollback;
