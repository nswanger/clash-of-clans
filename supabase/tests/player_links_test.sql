begin;
create extension if not exists pgtap with schema extensions;
select plan(40);

select has_table('public', 'profile_player_links', 'player link table exists');
select col_is_unique('public', 'profile_player_links', array['player_tag'], 'a player tag belongs to at most one app user');
select has_column('public', 'profiles', 'player_link_declined_at', 'profiles record a guest choice');
select policies_are('public', 'profile_player_links', array['Admins read player links', 'Users read own player links'], 'player links are read-only through policies');
select has_function('public', 'claim_player', array['text'], 'self-claim function exists');
select has_function('public', 'decline_player_link', array[]::text[], 'guest choice function exists');
select has_function('public', 'link_player', array['uuid', 'text'], 'admin link function exists');
select has_function('public', 'unlink_player', array['uuid', 'text'], 'admin unlink function exists');
select has_function('public', 'list_linkable_players', array['text'], 'linkable roster function exists');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
  ('60000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@example.test', 'x', now(), '{}', '{"name":"Link Admin"}'),
  ('60000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'main@example.test', 'x', now(), '{}', '{"name":"Main And Alt"}'),
  ('60000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gone@example.test', 'x', now(), '{}', '{"name":"Gone Leader"}'),
  ('60000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'revoked@example.test', 'x', now(), '{}', '{"name":"Revoked Leader"}'),
  ('60000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'guest@example.test', 'x', now(), '{}', '{"name":"Guest Leader"}'),
  ('60000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mover@example.test', 'x', now(), '{}', '{"name":"Mover Leader"}');

insert into public.user_roles (user_id, role) values
  ('60000000-0000-0000-0000-000000000001', 'admin'),
  ('60000000-0000-0000-0000-000000000002', 'leader'),
  ('60000000-0000-0000-0000-000000000003', 'leader'),
  ('60000000-0000-0000-0000-000000000005', 'leader'),
  ('60000000-0000-0000-0000-000000000006', 'leader');

insert into public.collection_runs (id, status, started_at, finished_at) values
  ('60000000-0000-0000-0000-000000000101', 'healthy', '2026-10-01T12:00:00Z', '2026-10-01T12:01:00Z'),
  ('60000000-0000-0000-0000-000000000102', 'healthy', '2026-10-02T12:00:00Z', '2026-10-02T12:01:00Z');

select public.apply_member_roster_daily(
  '#TESTCLAN', '2026-10-01', '2026-10-01T12:00:00Z', '60000000-0000-0000-0000-000000000101',
  '[{"player_tag":"#TESTMAIN","name":"Main","town_hall_level":17},
    {"player_tag":"#TESTALT","name":"Alt","town_hall_level":12},
    {"player_tag":"#TESTGONE","name":"Gone","town_hall_level":15},
    {"player_tag":"#TESTFREE","name":"Free","town_hall_level":14},
    {"player_tag":"#TESTHELD","name":"Held","town_hall_level":16}]'
);

-- A revoked person's link, as revoke_user_access leaves it.
insert into public.profile_player_links (user_id, player_tag, linked_by)
values ('60000000-0000-0000-0000-000000000004', '#TESTHELD', '60000000-0000-0000-0000-000000000004');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

-- Self-claims.
select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000002', true);
select lives_ok($$select public.claim_player('#TESTMAIN')$$, 'a leader claims a current, unheld member');
select throws_ok($$select public.claim_player('#TESTALT')$$, 'P0001', 'Your account is already linked to a player', 'a linked leader cannot claim a second account');
select throws_ok($$select public.decline_player_link()$$, 'P0001', 'Your account is already linked to a player', 'a linked leader cannot choose guest');
select throws_ok($$select public.link_player('60000000-0000-0000-0000-000000000002', '#TESTALT')$$, '42501', null, 'a leader cannot use the admin link');
select throws_ok(
  $$insert into public.profile_player_links (user_id, player_tag) values ('60000000-0000-0000-0000-000000000002', '#TESTALT')$$,
  '42501', null, 'links cannot be written directly'
);

select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000003', true);
select throws_ok($$select public.claim_player('#TESTMAIN')$$, 'P0001', 'Player is linked to someone else', 'a tag held by someone with access cannot be claimed');
select throws_ok($$select public.claim_player('#TESTNOPE')$$, 'P0001', 'Player is not a current clan member', 'only a current member can be claimed');
select ok(
  not exists (select 1 from public.list_linkable_players('#TESTCLAN') where player_tag = '#TESTMAIN')
    and exists (select 1 from public.list_linkable_players('#TESTCLAN') where player_tag = '#TESTFREE')
    and exists (select 1 from public.list_linkable_players('#TESTCLAN') where player_tag = '#TESTHELD'),
  'the linkable list leaves out tags held by someone with access, and keeps a revoked holder''s'
);

-- The guest choice, and a held-by-revoked tag moving.
select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000005', true);
select lives_ok($$select public.decline_player_link()$$, 'a leader with no link can choose guest');

select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000006', true);
select lives_ok($$select public.claim_player('#TESTHELD')$$, 'a tag held only by a revoked person can be claimed');
select is(
  (select count(*) from public.profile_player_links),
  1::bigint,
  'a leader reads only their own links'
);

-- Admin links, unlinks and remaps.
select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000001', true);
select create_invitation(now() + interval '1 day') as guest_token \gset
select lives_ok($$select public.link_player('60000000-0000-0000-0000-000000000002', '#TESTALT')$$, 'an admin links an alt');
select lives_ok($$select public.link_player('60000000-0000-0000-0000-000000000003', '#TESTGONE')$$, 'an admin links another leader');
select throws_ok($$select public.link_player('60000000-0000-0000-0000-000000000003', '#TESTMAIN')$$, 'P0001', 'Player is linked to someone else', 'an admin cannot silently move a tag between people with access');
select throws_ok($$select public.link_player('60000000-0000-0000-0000-000000000004', '#TESTFREE')$$, 'P0001', 'Target user does not have access', 'an admin cannot link someone without access');
select throws_ok($$select public.unlink_player('60000000-0000-0000-0000-000000000002', '#TESTFREE')$$, 'P0001', 'Player is not linked to this account', 'unlinking a tag that is not linked is refused');
select lives_ok($$select public.unlink_player('60000000-0000-0000-0000-000000000002', '#TESTALT')$$, 'an admin unlinks a tag');
select lives_ok($$select public.link_player('60000000-0000-0000-0000-000000000002', '#TESTALT')$$, 'an admin relinks the tag');
select is((select count(*) from public.profile_player_links), 4::bigint, 'an admin reads every link');

-- Redeeming an invitation clears a guest choice.
select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000005', true);
select lives_ok(format('select public.redeem_invitation(%L)', :'guest_token'), 'a guest redeems a new invitation');

reset role;
select is(
  (select player_link_declined_at from public.profiles where id = '60000000-0000-0000-0000-000000000005'),
  null::timestamptz,
  'redeeming an invitation clears the guest choice'
);
select is(
  (select linked_by from public.profile_player_links where player_tag = '#TESTMAIN'),
  '60000000-0000-0000-0000-000000000002'::uuid,
  'a self-claim records the claimant as linker'
);
-- One transaction stamps both events with the same instant, so this checks
-- the pair rather than their order. The fixture's own insert is excluded by actor.
select results_eq(
  $$select event_type, event_data->>'userId' from public.audit_events
    where entity_type = 'player_link' and event_data->>'playerTag' = '#TESTHELD'
      and actor_id = '60000000-0000-0000-0000-000000000006'
    order by event_type$$,
  $$values ('player_claimed', '60000000-0000-0000-0000-000000000006'), ('player_unlinked', '60000000-0000-0000-0000-000000000004')$$,
  'a moved tag writes the old holder''s unlink and the new claim'
);
select is(
  (select event_type from public.audit_events where entity_type = 'player_link' and event_data->>'playerTag' = '#TESTMAIN'),
  'player_claimed',
  'a self-claim is audited as a claim'
);
select is(
  (select count(*) from public.audit_events
    where event_type = 'player_linked' and event_data->>'playerTag' = '#TESTALT'
      and actor_id = '60000000-0000-0000-0000-000000000001'),
  2::bigint,
  'an admin link is audited as a link, with the admin as actor'
);
select is(
  (select count(*) from public.audit_events
    where event_type = 'player_unlinked' and event_data->>'playerTag' = '#TESTALT'
      and actor_id = '60000000-0000-0000-0000-000000000001'),
  1::bigint,
  'an admin unlink is audited with the admin as actor'
);

-- The next day's roster: Main and Gone have left, Alt stays.
select public.apply_member_roster_daily(
  '#TESTCLAN', '2026-10-02', '2026-10-02T12:00:00Z', '60000000-0000-0000-0000-000000000102',
  '[{"player_tag":"#TESTALT","name":"Alt","town_hall_level":12},
    {"player_tag":"#TESTFREE","name":"Free","town_hall_level":14},
    {"player_tag":"#TESTHELD","name":"Held","town_hall_level":16}]'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000001', true);
create temporary table snapshot_people on commit drop as
  select person from jsonb_array_elements(public.get_access_management_snapshot(50)->'people') person;
grant select on snapshot_people to authenticated;

select is(
  (select jsonb_array_length(person->'players') from snapshot_people where person->>'name' = 'Main And Alt'),
  2,
  'a person carries every linked player'
);
select ok(
  (select bool_or((player->>'isCurrentMember')::boolean)
   from snapshot_people, jsonb_array_elements(person->'players') player
   where person->>'name' = 'Main And Alt'),
  'a departed main with a current alt still has a current account'
);
select is(
  (select person->'players' from snapshot_people where person->>'name' = 'Gone Leader'),
  '[{"tag": "#TESTGONE", "name": "Gone", "isCurrentMember": false, "departureObservedOn": "2026-10-02"}]'::jsonb,
  'a person whose only account left carries its departure'
);
select is(
  (select person->'players' from snapshot_people where person->>'name' = 'Guest Leader'),
  '[]'::jsonb,
  'a person with no link carries no players'
);
select ok(
  (select bool_and(person ? 'players') from snapshot_people) and not exists (select 1 from snapshot_people where person->>'name' = 'Revoked Leader'),
  'every person with access carries players, and a revoked holder is not listed'
);

select * from finish();
rollback;
