begin;

create extension if not exists pgtap with schema extensions;

select plan(17);

select has_function('public', 'has_app_role', array['app_role'], 'role helper exists');
select has_function('public', 'redeem_invitation', array['text'], 'invitation redemption function exists');
select is((select prosecdef from pg_proc where oid = 'public.redeem_invitation(text)'::regprocedure), true, 'redemption is security definer');

select policies_are('public', 'user_roles', array['Admins manage roles'], 'only admins manage role assignments');
select policies_are('public', 'invitations', array['Admins manage invitations'], 'only admins manage invitations');
select policies_are('public', 'member_availability', array['Leaders read availability', 'Leaders write availability'], 'leaders manage availability');
select policies_are('public', 'leader_decisions', array['Leaders read decisions', 'Leaders create decisions', 'Leaders update decisions'], 'leaders manage decisions');

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

reset role;
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

reset role;
set local role anon;
select throws_ok($$select redeem_invitation('anything')$$, '42501', 'Authentication required', 'anonymous redemption is rejected');

reset role;
select is((select count(*) from public.invitations), 2::bigint, 'failed redemptions do not mutate invitations');

select * from finish();
rollback;
