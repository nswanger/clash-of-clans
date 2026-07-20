begin;

create extension if not exists pgtap with schema extensions;

select plan(13);

insert into collection_runs (id, status, started_at, finished_at)
values
  ('00000000-0000-0000-0000-000000000101', 'healthy', '2026-07-01T12:00:00Z', '2026-07-01T12:01:00Z'),
  ('00000000-0000-0000-0000-000000000108', 'healthy', '2026-07-08T12:00:00Z', '2026-07-08T12:01:00Z'),
  ('00000000-0000-0000-0000-000000000109', 'healthy', '2026-07-09T12:00:00Z', '2026-07-09T12:01:00Z');

select is(
  apply_member_roster_daily(
    '#HISTORY', '2026-07-01', '2026-07-01T12:00:00Z',
    '00000000-0000-0000-0000-000000000101',
    '[{"player_tag":"#ONE","name":"One","role":"member","clan_rank":1,"previous_clan_rank":2,"town_hall_level":17,"trophies":5000,"league_id":1,"league_name":"Legend League","donations":100,"donations_received":50}]'
  ),
  1,
  'first complete roster is stored'
);

select ok(
  apply_member_profile_daily(
    '#HISTORY', '2026-07-01', '#ONE', '2026-07-01T12:00:30Z',
    '00000000-0000-0000-0000-000000000101',
    '{"war_preference":"in","war_stars":100,"attack_wins":10,"defense_wins":2,"clan_capital_contributions":1000,"clan_games_points":5000}'
  ),
  'player profile enriches an observed roster member'
);

select is(
  apply_member_roster_daily(
    '#HISTORY', '2026-07-08', '2026-07-08T12:00:00Z',
    '00000000-0000-0000-0000-000000000108',
    '[{"player_tag":"#ONE","name":"One","role":"elder","clan_rank":1,"previous_clan_rank":1,"town_hall_level":17,"trophies":5050,"league_id":1,"league_name":"Legend League","donations":300,"donations_received":90}]'
  ),
  1,
  'later roster is stored at the daily grain'
);

select ok(
  apply_member_profile_daily(
    '#HISTORY', '2026-07-08', '#ONE', '2026-07-08T12:00:30Z',
    '00000000-0000-0000-0000-000000000108',
    '{"war_preference":"in","war_stars":102,"attack_wins":24,"defense_wins":3,"clan_capital_contributions":1400,"clan_games_points":6000}'
  ),
  'later profile is stored'
);

select is(
  apply_member_roster_daily(
    '#HISTORY', '2026-07-08', '2026-07-08T13:00:00Z',
    '00000000-0000-0000-0000-000000000108',
    '[{"player_tag":"#ONE","name":"One","role":"elder","clan_rank":1,"previous_clan_rank":1,"town_hall_level":17,"trophies":5060,"league_id":1,"league_name":"Legend League","donations":325,"donations_received":95}]'
  ),
  1,
  'newer same-day roster replaces member-list facts'
);

select is((select attack_wins from member_daily_snapshots where clan_tag = '#HISTORY' and observed_on = '2026-07-08' and player_tag = '#ONE'), 24, 'same-day roster refresh preserves the successful profile');
select is((select donations from member_daily_snapshots where clan_tag = '#HISTORY' and observed_on = '2026-07-08' and player_tag = '#ONE'), 325, 'same-day roster refresh updates member-list counters');
select is((select baseline_7d ->> 'observed_on' from member_roster_overview where clan_tag = '#HISTORY' and player_tag = '#ONE'), '2026-07-01', 'overview exposes the actual seven-day baseline date');
select is((select (baseline_7d ->> 'attack_wins')::integer from member_roster_overview where clan_tag = '#HISTORY' and player_tag = '#ONE'), 10, 'overview exposes baseline activity counters');
select is((select current_presence_started_on from member_roster_overview where clan_tag = '#HISTORY' and player_tag = '#ONE'), '2026-07-01'::date, 'overview exposes the current uninterrupted observed-presence period');

select is(
  apply_member_roster_daily(
    '#HISTORY', '2026-07-09', '2026-07-09T12:00:00Z',
    '00000000-0000-0000-0000-000000000109', '[]'
  ),
  0,
  'an empty successful roster remains distinct from a missing collection'
);

select is((select is_current_member from member_roster_overview where clan_tag = '#HISTORY' and player_tag = '#ONE'), false, 'member absence from a later complete roster marks the member as former');
select is((select departure_observed_on from member_roster_overview where clan_tag = '#HISTORY' and player_tag = '#ONE'), '2026-07-09'::date, 'departure is dated from the first complete roster that observed the absence');

select * from finish();
rollback;
