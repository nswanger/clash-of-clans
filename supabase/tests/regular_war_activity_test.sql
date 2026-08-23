begin;

create extension if not exists pgtap with schema extensions;

select plan(5);

insert into cwl_seasons (clan_tag, season_id, war_size, target_core_size, rotation_positions)
values ('#ACTIVITY', '2026-08', 15, 10, 5);

insert into cwl_members (clan_tag, season_id, player_tag, name, town_hall_level)
values
  ('#ACTIVITY', '2026-08', '#ACTIVE', 'Active Player', 17),
  ('#ACTIVITY', '2026-08', '#MISSED', 'Missed Player', 17);

insert into regular_wars (war_key, clan_tag, state, end_time, team_size, attacks_per_member)
values
  ('#REGULAR-ONE', '#ACTIVITY', 'warEnded', '2026-08-01T12:00:00Z', 15, 1),
  ('#REGULAR-TWO', '#ACTIVITY', 'warEnded', '2026-08-08T12:00:00Z', 15, 1);

insert into regular_war_members (war_key, player_tag, name, town_hall_level, assigned_attacks, attacks_made, stars)
values
  ('#REGULAR-ONE', '#ACTIVE', 'Active Player', 17, 2, 2, 5),
  ('#REGULAR-TWO', '#ACTIVE', 'Active Player', 17, 1, 1, 3),
  ('#REGULAR-ONE', '#MISSED', 'Missed Player', 17, 2, 1, 1);

select is(
  (select wars_participated from regular_war_member_activity where clan_tag = '#ACTIVITY' and player_tag = '#ACTIVE'),
  2,
  'activity counts only completed wars with member evidence'
);
select is(
  (select activity_score from regular_war_member_activity where clan_tag = '#ACTIVITY' and player_tag = '#ACTIVE'),
  100::numeric,
  'activity score measures attacks used rather than signup opportunity'
);
select is(
  (select performance_score from regular_war_member_activity where clan_tag = '#ACTIVITY' and player_tag = '#MISSED'),
  33::numeric,
  'performance score is derived separately from stars per completed attack'
);
select is(
  (select stars_per_attack from regular_war_member_activity where clan_tag = '#ACTIVITY' and player_tag = '#ACTIVE'),
  2.67::numeric,
  'stars per attack preserves the unrounded performance context'
);
select is(
  (select wars_observed from regular_war_clan_history where clan_tag = '#ACTIVITY'),
  2,
  'war coverage counts observed completed war summaries'
);

-- The CWL rating's own assertions moved to `cwl_regular_war_window_test.sql`
-- when #89 gave the rating a bounded window: they belong beside the window that
-- decides them, and this file covers the deprecated all-time view only.

select * from finish();
rollback;
