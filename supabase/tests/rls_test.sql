begin;

create extension if not exists pgtap with schema extensions;

select plan(26);

select has_function('public', 'has_app_role', array['app_role'], 'role helper exists');
select has_function('public', 'redeem_invitation', array['text'], 'invitation redemption function exists');
select is((select prosecdef from pg_proc where oid = 'public.redeem_invitation(text)'::regprocedure), true, 'redemption is security definer');

select policies_are('public', 'user_roles', array['Admins manage roles'], 'only admins manage role assignments');
select policies_are('public', 'invitations', array['Admins manage invitations'], 'only admins manage invitations');
select policies_are('public', 'member_availability', array['Leaders read availability', 'Leaders write availability'], 'leaders manage availability');
select policies_are('public', 'leader_decisions', array['Leaders read decisions', 'Leaders create decisions'], 'leader decisions are readable and append-only');
select policies_are('public', 'clan_roster_daily_observations', array['Leaders read roster observations'], 'leaders can only read roster observations');
select policies_are('public', 'member_daily_snapshots', array['Leaders read member history'], 'leaders can only read member history');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@example.test', '', now(), '{}', '{}'),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'leader@example.test', '', now(), '{}', '{}'),
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'invitee@example.test', '', now(), '{}', '{}');

insert into profiles (id, display_name) values
  ('00000000-0000-0000-0000-000000000001', 'Admin'),
  ('00000000-0000-0000-0000-000000000002', 'Leader'),
  ('00000000-0000-0000-0000-000000000003', 'Invitee')
on conflict (id) do update set display_name = excluded.display_name;
insert into user_roles (user_id, role) values
  ('00000000-0000-0000-0000-000000000001', 'admin'),
  ('00000000-0000-0000-0000-000000000002', 'leader');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select ok(has_app_role('leader'), 'leader role is recognized');
select throws_ok(
  $$insert into invitations (token_hash, expires_at, created_by) values (extensions.digest('leader-cannot-invite', 'sha256'), now() + interval '1 day', auth.uid())$$,
  '42501', null, 'leader cannot create invitations'
);
select throws_ok(
  $$insert into user_roles (user_id, role, created_by) values ('00000000-0000-0000-0000-000000000003', 'admin', auth.uid())$$,
  '42501', null, 'leader cannot mutate roles'
);

reset role;
insert into cwl_seasons (clan_tag, season_id, war_size, target_core_size, rotation_positions)
values ('#RLSCLAN', '2026-07', 15, 10, 5);
insert into cwl_members (clan_tag, season_id, player_tag, name, town_hall_level)
values ('#RLSCLAN', '2026-07', '#RLSPLAYER', 'RLS Player', 17);
insert into recommendations (id, clan_tag, season_id, strategy_version, input, output)
values ('00000000-0000-0000-0000-000000000020', '#RLSCLAN', '2026-07', 'test-v1', '{}', '{}');
insert into invitations (token_hash, expires_at, created_by) values
  (extensions.digest('valid-token', 'sha256'), now() + interval '1 day', '00000000-0000-0000-0000-000000000001'),
  (extensions.digest('expired-token', 'sha256'), now() - interval '1 second', '00000000-0000-0000-0000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
select lives_ok($$select redeem_invitation('valid-token')$$, 'authenticated invitee redeems a valid invitation');
select ok(has_app_role('leader'), 'redemption grants leader role');

reset role;
select is((select used_by from invitations where token_hash = extensions.digest('valid-token', 'sha256')), '00000000-0000-0000-0000-000000000003'::uuid, 'redemption records invitee');
select isnt((select used_at from invitations where token_hash = extensions.digest('valid-token', 'sha256')), null, 'redemption records use time');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
select throws_ok($$select redeem_invitation('valid-token')$$, 'P0001', 'Invitation is invalid, expired, or already used', 'invitation is single use');
select throws_ok($$select redeem_invitation('expired-token')$$, 'P0001', 'Invitation is invalid, expired, or already used', 'expired invitation is rejected');

select lives_ok(
  $$insert into member_availability (clan_tag, season_id, player_tag, status, recorded_by)
    values ('#RLSCLAN', '2026-07', '#RLSPLAYER', 'available', auth.uid())$$,
  'leader can record availability'
);
select lives_ok(
  $$insert into leader_decisions (recommendation_id, status, final_changes, actor_id)
    values ('00000000-0000-0000-0000-000000000020', 'approved', '[]', auth.uid())$$,
  'leader can append an approval decision'
);
select lives_ok(
  $$insert into leader_decisions (recommendation_id, status, final_changes, override_note, actor_id)
    values ('00000000-0000-0000-0000-000000000020', 'overridden', '[]', 'later correction', auth.uid())$$,
  'leader can append a later override without replacing history'
);
select is(
  (select count(*) from leader_decisions where recommendation_id = '00000000-0000-0000-0000-000000000020'),
  2::bigint, 'multiple decision events are preserved'
);
select throws_ok(
  $$update leader_decisions set final_changes = '[{"tampered":true}]' where recommendation_id = '00000000-0000-0000-0000-000000000020'$$,
  '42501', null, 'leader cannot update decision history'
);
select throws_ok(
  $$delete from leader_decisions where recommendation_id = '00000000-0000-0000-0000-000000000020'$$,
  '42501', null, 'leader cannot delete decision history'
);

reset role;
set local role anon;
select throws_ok(
  $$select redeem_invitation('anything')$$,
  '42501',
  'permission denied for function redeem_invitation',
  'anonymous redemption is rejected before function execution'
);

reset role;
select is((select count(*) from public.invitations), 2::bigint, 'failed redemptions do not mutate invitations');

select * from finish();
rollback;
