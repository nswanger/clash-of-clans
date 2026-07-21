begin;
create extension if not exists pgtap with schema extensions;
select plan(39);

select has_column('public', 'invitations', 'revoked_at', 'invitations record revocation time');
select has_column('public', 'invitations', 'revoked_by', 'invitations record revoking admin');
select has_column('public', 'invitations', 'reissued_from_id', 'invitations record reissue lineage');
select policies_are('public', 'user_roles', array['Admins read roles'], 'admins have read-only role table access');
select policies_are('public', 'invitations', array['Admins read invitations'], 'admins have read-only invitation table access');
select has_function('public', 'revoke_invitation', array['uuid'], 'invitation revocation function exists');
select has_function('public', 'reissue_invitation', array['uuid', 'timestamptz'], 'invitation reissue function exists');
select has_function('public', 'promote_to_admin', array['uuid'], 'promotion function exists');
select has_function('public', 'demote_to_leader', array['uuid'], 'demotion function exists');
select has_function('public', 'revoke_user_access', array['uuid'], 'access revocation function exists');
select has_function('public', 'get_access_management_snapshot', array['integer'], 'access snapshot function exists');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
  ('50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin-one@example.test', 'x', now(), '{}', '{"name":"Admin One"}'),
  ('50000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin-two@example.test', 'x', now(), '{}', '{"name":"Admin Two"}'),
  ('50000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'leader@example.test', 'x', now(), '{}', '{"name":"Leader"}');

insert into public.user_roles (user_id, role) values
  ('50000000-0000-0000-0000-000000000001', 'admin'),
  ('50000000-0000-0000-0000-000000000002', 'admin'),
  ('50000000-0000-0000-0000-000000000003', 'leader');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000001', true);

select throws_ok(
  $$insert into public.user_roles (user_id, role) values ('50000000-0000-0000-0000-000000000003', 'admin')$$,
  '42501', null, 'admins cannot bypass role functions with direct writes'
);
select throws_ok(
  $$delete from public.user_roles where user_id = '50000000-0000-0000-0000-000000000003'$$,
  '42501', null, 'admins cannot directly delete roles'
);

select lives_ok($$select public.promote_to_admin('50000000-0000-0000-0000-000000000003')$$, 'admin can promote a leader');
select ok(public.has_app_role('admin'::public.app_role), 'calling admin retains admin access after promoting another user');
select is(
  (select count(*) from public.user_roles where user_id = '50000000-0000-0000-0000-000000000003' and role = 'admin'),
  1::bigint,
  'promotion creates the admin role once'
);

select throws_ok(
  $$select public.demote_to_leader('50000000-0000-0000-0000-000000000001')$$,
  'P0001', 'You cannot demote your own account', 'admin cannot self-demote'
);
select throws_ok(
  $$select public.revoke_user_access('50000000-0000-0000-0000-000000000001')$$,
  'P0001', 'You cannot revoke your own access', 'admin cannot self-revoke'
);

select lives_ok($$select public.demote_to_leader('50000000-0000-0000-0000-000000000002')$$, 'admin can demote another admin');
select is(
  (select count(*) from public.user_roles where user_id = '50000000-0000-0000-0000-000000000002' and role = 'admin'),
  0::bigint,
  'demotion removes the admin role'
);
select is(
  (select count(*) from public.user_roles where user_id = '50000000-0000-0000-0000-000000000002' and role = 'leader'),
  1::bigint,
  'demotion preserves leader access'
);

select lives_ok($$select public.revoke_user_access('50000000-0000-0000-0000-000000000002')$$, 'admin can revoke another user');
select is(
  (select count(*) from public.user_roles where user_id = '50000000-0000-0000-0000-000000000002'),
  0::bigint,
  'revocation removes all roles'
);

select lives_ok(
  $$select public.demote_to_leader('50000000-0000-0000-0000-000000000003')$$,
  'admin can demote the remaining non-current admin'
);
select is(
  (select count(*) from public.user_roles where role = 'admin'),
  1::bigint,
  'self-lockout guards leave one final admin in place'
);

create temporary table original_invitation as
select public.create_invitation(now() + interval '1 day') as token;
create temporary table original_invitation_id as
select id from public.invitations
where token_hash = extensions.digest((select token from original_invitation), 'sha256');
create temporary table replacement_invitation as
select public.reissue_invitation((select id from original_invitation_id), now() + interval '1 day') as token;

select isnt((select revoked_at from public.invitations where id = (select id from original_invitation_id)), null, 'reissue revokes the original invitation');
select is(
  (select reissued_from_id from public.invitations where token_hash = extensions.digest((select token from replacement_invitation), 'sha256')),
  (select id from original_invitation_id),
  'replacement records its original invitation'
);
select ok(length((select token from replacement_invitation)) >= 32, 'reissue returns a strong one-time token');
select throws_ok(
  $$select public.reissue_invitation((select id from original_invitation_id), now() + interval '1 day')$$,
  'P0001', 'Invitation is no longer pending', 'an invitation cannot be reissued twice'
);

create temporary table revocable_invitation as
select public.create_invitation(now() + interval '1 day') as token;
create temporary table revocable_invitation_id as
select id from public.invitations
where token_hash = extensions.digest((select token from revocable_invitation), 'sha256');
select lives_ok($$select public.revoke_invitation((select id from revocable_invitation_id))$$, 'admin can revoke a pending invitation');
select throws_ok(
  $$select public.redeem_invitation((select token from revocable_invitation))$$,
  'P0001', 'Invitation is invalid, expired, revoked, or already used', 'revoked invitation cannot be redeemed'
);

select is((select count(*) from public.audit_events where event_type = 'invitation_reissued'), 1::bigint, 'reissue is audited once');
select is((select count(*) from public.audit_events where event_type = 'invitation_revoked'), 2::bigint, 'explicit and reissue revocations are audited');
select is(
  (select count(*) from public.audit_events where event_data ? 'token_hash' or event_data ? 'token'),
  0::bigint,
  'audit data excludes invitation tokens and hashes'
);

select is((public.get_access_management_snapshot(20)->'people'->0 ? 'id'), true, 'snapshot returns people data');
select is(jsonb_array_length(public.get_access_management_snapshot(20)->'invitations') >= 3, true, 'snapshot returns invitation history');
select is(jsonb_array_length(public.get_access_management_snapshot(20)->'auditEvents') > 0, true, 'snapshot returns access audit events');
select is((public.get_access_management_snapshot(20)::text like '%token_hash%'), false, 'snapshot excludes token hashes');

select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select public.get_access_management_snapshot(20)$$,
  '42501', 'Admin access required', 'non-admin cannot read access snapshot'
);

select * from finish();
rollback;
