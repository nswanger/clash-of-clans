begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

-- #117: the operator role is additive and enforces nothing by itself.
select ok(
  exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'app_role' and e.enumlabel = 'operator'),
  'app_role carries operator'
);
select has_column('public', 'collection_runs', 'next_run_at', 'collection runs record the scheduled next run');
select col_type_is('public', 'collection_runs', 'next_run_at', 'timestamp with time zone', 'next_run_at is a timestamptz');
select col_is_null('public', 'collection_runs', 'next_run_at', 'next_run_at is null while running or after a crash');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
  ('70000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'operator-admin@example.test', 'x', now(), '{}', '{"name":"Operator Admin"}'),
  ('70000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'operator-only@example.test', 'x', now(), '{}', '{"name":"Operator Only"}'),
  ('70000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'plain-admin@example.test', 'x', now(), '{}', '{"name":"Plain Admin"}');

insert into public.user_roles (user_id, role) values
  ('70000000-0000-0000-0000-000000000001', 'admin'),
  ('70000000-0000-0000-0000-000000000001', 'operator'),
  ('70000000-0000-0000-0000-000000000002', 'operator'),
  ('70000000-0000-0000-0000-000000000003', 'admin');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

-- admin + operator: both checks pass.
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000001', true);
select ok(public.is_leader(), 'an admin who is also an operator is still a leader');
select ok(public.has_app_role('operator'::public.app_role), 'an admin who is also an operator holds the operator role');
select is(
  (select person->>'isOperator'
   from jsonb_array_elements(public.get_access_management_snapshot()->'people') person
   where person->>'id' = '70000000-0000-0000-0000-000000000001'),
  'true',
  'the access snapshot flags the operator'
);
select is(
  (select person->>'isOperator'
   from jsonb_array_elements(public.get_access_management_snapshot()->'people') person
   where person->>'id' = '70000000-0000-0000-0000-000000000003'),
  'false',
  'the access snapshot does not flag a plain admin'
);

-- operator alone: never a route in.
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000002', true);
select ok(not public.is_leader(), 'operator alone is not a leader');

select * from finish();
rollback;
