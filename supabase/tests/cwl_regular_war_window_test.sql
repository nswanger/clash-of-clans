-- The regular-war window leading into a CWL season, and the rating built on it (#89).
begin;

create extension if not exists pgtap with schema extensions;

select plan(29);

select has_function('public', 'regular_war_member_activity_between',
  array['text', 'timestamptz', 'timestamptz'],
  'the bounded aggregation exists');
select has_view('public', 'cwl_season_regular_window', 'the per-season window exists');
select has_view('public', 'cwl_member_regular_activity', 'the CWL-scoped activity view exists');

insert into collection_runs (id, status, started_at, finished_at)
values ('00000000-0000-0000-0000-000000000890', 'healthy', '2026-07-06T00:00:00Z', '2026-07-06T00:01:00Z');

-- Two CWL seasons: the previous one closes the window, the current one opens it.
insert into cwl_seasons (clan_tag, season_id, war_size, target_core_size, rotation_positions)
values ('#W89', '2026-07-01', 15, 10, 5),
       ('#W89', '2026-08-01', 15, 10, 5);

insert into cwl_wars (war_tag, clan_tag, season_id, war_day, state, preparation_start_time, end_time)
values ('#CWL-JUL', '#W89', '2026-07-01', 1, 'warEnded', '2026-07-02T00:00:00Z', '2026-07-05T12:00:00Z'),
       ('#CWL-AUG', '#W89', '2026-08-01', 1, 'warEnded', '2026-08-02T00:00:00Z', '2026-08-10T12:00:00Z');

insert into cwl_members (clan_tag, season_id, player_tag, name, town_hall_level)
values ('#W89', '2026-08-01', '#ALLIN',   'All In',   17),
       ('#W89', '2026-08-01', '#SITTER',  'Sitter',   17),
       ('#W89', '2026-08-01', '#HALF',    'Half',     16),
       ('#W89', '2026-08-01', '#QUALITY', 'Quality',  16),
       ('#W89', '2026-08-01', '#NEWBIE',  'Newbie',   15),
       ('#W89', '2026-08-01', '#FOUNDER', 'Founder',  15);

-- Regular wars: three inside the window, one before it, one after.
insert into regular_wars (war_key, clan_tag, state, preparation_start_time, end_time, team_size, attacks_per_member, finalization_status)
values ('#RW0', '#W89', 'warEnded', '2026-06-29T12:00:00Z', '2026-07-01T12:00:00Z', 15, 2, 'complete_war_ended'),
       ('#RW1', '#W89', 'warEnded', '2026-07-07T12:00:00Z', '2026-07-10T12:00:00Z', 15, 2, 'complete_war_ended'),
       ('#RW2', '#W89', 'warEnded', '2026-07-15T12:00:00Z', '2026-07-17T12:00:00Z', 15, 2, 'complete_war_ended'),
       ('#RW3', '#W89', 'warEnded', '2026-07-22T12:00:00Z', '2026-07-24T12:00:00Z', 15, 2, 'complete_war_ended'),
       ('#RW4', '#W89', 'warEnded', '2026-08-03T12:00:00Z', '2026-08-05T12:00:00Z', 15, 2, 'complete_war_ended');

insert into regular_war_members (war_key, player_tag, name, town_hall_level, assigned_attacks, attacks_made, stars)
values ('#RW0', '#SITTER',  'Sitter',  17, 2, 2, 6),
       ('#RW1', '#ALLIN',   'All In',  17, 2, 2, 6),
       ('#RW2', '#ALLIN',   'All In',  17, 2, 2, 6),
       ('#RW3', '#ALLIN',   'All In',  17, 2, 2, 6),
       ('#RW1', '#HALF',    'Half',    16, 2, 2, 2),
       ('#RW1', '#QUALITY', 'Quality', 16, 2, 2, 6),
       ('#RW4', '#SITTER',  'Sitter',  17, 2, 2, 6);

-- The clan is first observed on 07-06; #NEWBIE only appears on 07-20.
select is(
  apply_member_roster_daily('#W89', '2026-07-06'::date, '2026-07-06T00:00:00Z', '00000000-0000-0000-0000-000000000890',
    '[{"player_tag":"#ALLIN","name":"All In","role":"member","town_hall_level":17},
      {"player_tag":"#SITTER","name":"Sitter","role":"member","town_hall_level":17},
      {"player_tag":"#HALF","name":"Half","role":"member","town_hall_level":16},
      {"player_tag":"#QUALITY","name":"Quality","role":"member","town_hall_level":16},
      {"player_tag":"#FOUNDER","name":"Founder","role":"member","town_hall_level":15}]'),
  5, 'the clan roster is first observed on 2026-07-06');

select is(
  apply_member_roster_daily('#W89', '2026-07-20'::date, '2026-07-20T00:00:00Z', '00000000-0000-0000-0000-000000000890',
    '[{"player_tag":"#ALLIN","name":"All In","role":"member","town_hall_level":17},
      {"player_tag":"#SITTER","name":"Sitter","role":"member","town_hall_level":17},
      {"player_tag":"#HALF","name":"Half","role":"member","town_hall_level":16},
      {"player_tag":"#QUALITY","name":"Quality","role":"member","town_hall_level":16},
      {"player_tag":"#FOUNDER","name":"Founder","role":"member","town_hall_level":15},
      {"player_tag":"#NEWBIE","name":"Newbie","role":"member","town_hall_level":15}]'),
  6, '#NEWBIE first appears on 2026-07-20');

-- CWL attack evidence for the current season, so reliability exists for some
-- members and is absent for others.
insert into cwl_war_members (war_tag, player_tag, map_position, assigned_attacks)
values ('#CWL-AUG', '#ALLIN', 1, 1),
       ('#CWL-AUG', '#HALF', 2, 2);
insert into cwl_attacks (war_tag, attacker_tag, attack_order, stars, destruction)
values ('#CWL-AUG', '#ALLIN', 1, 3, 100),
       ('#CWL-AUG', '#HALF', 2, 1, 40);

-- ---------------------------------------------------------------------------
-- The window
-- ---------------------------------------------------------------------------

select is(
  (select window_to from cwl_season_regular_window where clan_tag = '#W89' and season_id = '2026-08-01'),
  '2026-08-02T00:00:00Z'::timestamptz,
  'the window closes at the season''s earliest preparation start');
select is(
  (select window_to_basis from cwl_season_regular_window where clan_tag = '#W89' and season_id = '2026-08-01'),
  'season_preparation_start',
  'the closing bound reports that it came from a collected war');
select is(
  (select window_from from cwl_season_regular_window where clan_tag = '#W89' and season_id = '2026-08-01'),
  '2026-07-05T12:00:00Z'::timestamptz,
  'the window opens when the previous CWL''s last war ended');
select is(
  (select window_from_basis from cwl_season_regular_window where clan_tag = '#W89' and season_id = '2026-08-01'),
  'previous_cwl_end',
  'the opening bound reports that a previous CWL supplied it');

-- The first collected season has no predecessor and no war of its own.
insert into cwl_seasons (clan_tag, season_id, war_size, target_core_size, rotation_positions)
values ('#W89F', '2026-06-01', 15, 10, 5);
select is(
  (select window_to from cwl_season_regular_window where clan_tag = '#W89F'),
  '2026-06-01T00:00:00Z'::timestamptz,
  'with no collected war the window closes at the season''s month start');
select is(
  (select window_to_basis || '/' || window_from_basis from cwl_season_regular_window where clan_tag = '#W89F'),
  'season_month_start/fixed_30_days',
  'both fallbacks say so rather than presenting themselves as the real bound');
select is(
  (select window_from from cwl_season_regular_window where clan_tag = '#W89F'),
  '2026-05-02T00:00:00Z'::timestamptz,
  'with no previous CWL the window falls back to thirty days');

-- ---------------------------------------------------------------------------
-- Participation, and the zero that is a signal
-- ---------------------------------------------------------------------------

select is(
  (select wars_observed from cwl_member_regular_activity where clan_tag = '#W89' and season_id = '2026-08-01' and player_tag = '#ALLIN'),
  3, 'only wars ending inside the window are counted');
select is(
  (select available_attacks from cwl_member_regular_activity where clan_tag = '#W89' and season_id = '2026-08-01' and player_tag = '#ALLIN'),
  6, 'the denominator is every attack the window offered');
select is(
  (select regular_score from cwl_member_regular_activity where clan_tag = '#W89' and season_id = '2026-08-01' and player_tag = '#ALLIN'),
  100::numeric, 'every war, every attack, every star is a hundred');

-- The defect this migration exists to remove: before it, a member who appeared
-- in no war had no row at all and was indistinguishable from one the collector
-- knows nothing about.
select is(
  (select count(*) from cwl_member_regular_activity where clan_tag = '#W89' and season_id = '2026-08-01' and player_tag = '#SITTER'),
  1::bigint, 'a member who appeared in no war still has a row');
select is(
  (select regular_score from cwl_member_regular_activity where clan_tag = '#W89' and season_id = '2026-08-01' and player_tag = '#SITTER'),
  0::numeric, 'sitting out every war in the window is a zero, not an absence');
select is(
  (select wars_observed from cwl_member_regular_activity where clan_tag = '#W89' and season_id = '2026-08-01' and player_tag = '#SITTER'),
  3, 'the sitter-out is measured against the window''s wars, not against none');

-- Wars outside the window are not credit. #SITTER played in both #RW0 (before)
-- and #RW4 (after) and still reads as zero.
select is(
  (select attacks_made from cwl_member_regular_activity where clan_tag = '#W89' and season_id = '2026-08-01' and player_tag = '#SITTER'),
  0, 'attacks outside the window do not count toward it');

select is(
  (select regular_score from cwl_member_regular_activity where clan_tag = '#W89' and season_id = '2026-08-01' and player_tag = '#HALF'),
  33::numeric, 'one war of three with two one-star attacks');
select is(
  (select regular_score from cwl_member_regular_activity where clan_tag = '#W89' and season_id = '2026-08-01' and player_tag = '#QUALITY'),
  53::numeric, 'identical attendance with three-star attacks ranks higher');

-- ---------------------------------------------------------------------------
-- The join buffer, and the gate that keeps it from misfiring
-- ---------------------------------------------------------------------------

select is(
  (select wars_observed from cwl_member_regular_activity where clan_tag = '#W89' and season_id = '2026-08-01' and player_tag = '#NEWBIE'),
  1, 'a member who joined mid-window is measured only against wars beginning after they arrived');
select is(
  (select wars_observed from cwl_member_regular_activity where clan_tag = '#W89' and season_id = '2026-08-01' and player_tag = '#FOUNDER'),
  3, 'a member present at the clan''s first observation is not treated as newly joined');

-- ---------------------------------------------------------------------------
-- The rating
-- ---------------------------------------------------------------------------

select is(
  (select rating_basis from cwl_member_overall_rating where clan_tag = '#W89' and season_id = '2026-08-01' and player_tag = '#ALLIN'),
  'blended', 'a member with both kinds of evidence is blended');
select is(
  (select overall_rating from cwl_member_overall_rating where clan_tag = '#W89' and season_id = '2026-08-01' and player_tag = '#HALF'),
  43::numeric, 'the blend is sixty per cent CWL completion and forty per cent regular-war activity');

-- The day-one case. Before #89 this member had NO rating at all, because
-- reliability is NULL until a war day ends.
select is(
  (select rating_basis from cwl_member_overall_rating where clan_tag = '#W89' and season_id = '2026-08-01' and player_tag = '#QUALITY'),
  'regular_only', 'regular-war history alone constitutes a rating when no CWL attack has been assigned');
select is(
  (select overall_rating from cwl_member_overall_rating where clan_tag = '#W89' and season_id = '2026-08-01' and player_tag = '#QUALITY'),
  53::numeric, 'the regular-only rating is the regular score itself');

-- A window that observed no wars says nothing about anybody: absence of
-- evidence is never a penalty.
insert into cwl_seasons (clan_tag, season_id, war_size, target_core_size, rotation_positions)
values ('#W89E', '2026-08-01', 15, 10, 5);
insert into cwl_members (clan_tag, season_id, player_tag, name, town_hall_level)
values ('#W89E', '2026-08-01', '#LONELY', 'Lonely', 17);
insert into cwl_wars (war_tag, clan_tag, season_id, war_day, state, preparation_start_time, end_time)
values ('#CWL-EMPTY', '#W89E', '2026-08-01', 1, 'warEnded', '2026-08-02T00:00:00Z', '2026-08-10T12:00:00Z');
insert into cwl_war_members (war_tag, player_tag, map_position, assigned_attacks)
values ('#CWL-EMPTY', '#LONELY', 1, 2);
insert into cwl_attacks (war_tag, attacker_tag, attack_order, stars, destruction)
values ('#CWL-EMPTY', '#LONELY', 1, 3, 100);

select is(
  (select rating_basis from cwl_member_overall_rating where clan_tag = '#W89E' and player_tag = '#LONELY'),
  'reliability_only', 'an empty window falls back to CWL completion rather than scoring zero');
select is(
  (select overall_rating from cwl_member_overall_rating where clan_tag = '#W89E' and player_tag = '#LONELY'),
  50::numeric, 'the fallback rating is CWL completion undiluted');

select * from finish();
rollback;
