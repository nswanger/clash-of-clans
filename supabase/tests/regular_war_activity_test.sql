begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

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

insert into cwl_wars (war_tag, clan_tag, season_id, war_day, state, end_time)
values ('#CWL-ACTIVITY', '#ACTIVITY', '2026-08', 1, 'warEnded', '2026-08-09T12:00:00Z');
insert into cwl_war_members (war_tag, player_tag, map_position, assigned_attacks)
values ('#CWL-ACTIVITY', '#ACTIVE', 1, 1);
insert into cwl_attacks (war_tag, attacker_tag, attack_order, stars, destruction)
values ('#CWL-ACTIVITY', '#ACTIVE', 1, 3, 100);

select is(
  (select overall_rating from cwl_member_overall_rating where clan_tag = '#ACTIVITY' and season_id = '2026-08' and player_tag = '#ACTIVE'),
  100::numeric,
  'CWL rating uses current-CWL completion independently of regular activity'
);
select is(
  (select regular_activity_score from cwl_member_overall_rating where clan_tag = '#ACTIVITY' and season_id = '2026-08' and player_tag = '#ACTIVE'),
  100::numeric,
  'CWL rating view exposes regular activity as a separate signal'
);
select is(
  (select regular_activity_score from cwl_member_overall_rating where clan_tag = '#ACTIVITY' and season_id = '2026-08' and player_tag = '#MISSED'),
  50::numeric,
  'CWL rating view exposes missed regular attacks without changing CWL rating'
);

select * from finish();
rollback;
