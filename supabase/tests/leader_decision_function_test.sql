begin;
create extension if not exists pgtap with schema extensions;
select plan(5);
select has_function('public', 'record_leader_decision', array['uuid','decision_status','jsonb','text'], 'decision function exists');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'decision-leader@example.com', 'x', now(), '{}', '{"name":"Decision Leader"}');
insert into user_roles (user_id, role) values ('20000000-0000-0000-0000-000000000001', 'leader');
insert into cwl_seasons (clan_tag, season_id, war_size, target_core_size, rotation_positions) values ('#DECIDE', '2026-07', 15, 10, 5);
insert into recommendations (id, clan_tag, season_id, strategy_version, input, output) values
  ('20000000-0000-0000-0000-000000000010', '#DECIDE', '2026-07', 'test', '{}', '{}'),
  ('20000000-0000-0000-0000-000000000011', '#DECIDE', '2026-07', 'test', '{}', '{}');

set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select lives_ok($$select record_leader_decision('20000000-0000-0000-0000-000000000010', 'approved', '[]', null)$$, 'leader approves once');
select throws_ok($$select record_leader_decision('20000000-0000-0000-0000-000000000010', 'approved', '[]', null)$$, 'P0001', 'Recommendation is missing or already decided', 'duplicate decision is rejected');
select throws_ok($$select record_leader_decision('20000000-0000-0000-0000-000000000011', 'overridden', '[]', null)$$, 'P0001', 'Override note is required', 'override requires note');

reset role;
select results_eq($$select status::text from recommendations where id = '20000000-0000-0000-0000-000000000010'$$, array['approved'], 'recommendation status advances atomically');

select * from finish();
rollback;
