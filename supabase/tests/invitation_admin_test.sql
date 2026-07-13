begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

select has_function('public', 'create_invitation', array['timestamptz'], 'server-side invitation creation exists');
select is((select prosecdef from pg_proc where oid = 'public.create_invitation(timestamptz)'::regprocedure), true, 'invitation creation is security definer');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'invite-admin@example.com', 'x', now(), '{}', '{"name":"Invite Admin"}'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'invite-leader@example.com', 'x', now(), '{}', '{"name":"Invite Leader"}');
insert into user_roles (user_id, role) values
  ('10000000-0000-0000-0000-000000000001', 'admin'),
  ('10000000-0000-0000-0000-000000000002', 'leader');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
create temporary table issued_token as select create_invitation(now() + interval '1 day') as token;
select ok(length((select token from issued_token)) >= 32, 'admin receives a strong one-time token');

reset role;
select is((select count(*) from invitations where token_hash = extensions.digest((select token from issued_token), 'sha256')), 1::bigint, 'only the token hash is stored');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select throws_ok($$select create_invitation(now() + interval '1 day')$$, '42501', 'Admin access required', 'leaders cannot create invitations');

select * from finish();
rollback;
