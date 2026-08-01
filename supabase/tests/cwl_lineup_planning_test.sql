BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(28);

SELECT has_table('public', 'cwl_daily_lineup_plans', 'daily lineup plan table exists');
SELECT has_table('public', 'cwl_daily_lineup_plan_members', 'daily lineup plan members table exists');
SELECT col_is_pk(
    'public',
    'cwl_daily_lineup_plans',
    ARRAY['clan_tag', 'season_id', 'war_day'],
    'daily plan identity is season and war day'
);
SELECT col_is_pk(
    'public',
    'cwl_daily_lineup_plan_members',
    ARRAY['clan_tag', 'season_id', 'war_day', 'player_tag'],
    'daily plan member identity is unique within a plan'
);
SELECT col_is_unique(
    'public',
    'cwl_daily_lineup_plan_members',
    ARRAY['clan_tag', 'season_id', 'war_day', 'lineup_position'],
    'daily plan positions are unique within a plan'
);
SELECT policies_are(
    'public',
    'cwl_daily_lineup_plans',
    ARRAY['Leaders read daily lineup plans'],
    'leaders can read plans while protected functions own writes'
);
SELECT policies_are(
    'public',
    'cwl_daily_lineup_plan_members',
    ARRAY['Leaders read daily lineup plan members'],
    'leaders can read plan members while protected functions own writes'
);
SELECT has_function(
    'public',
    'ensure_cwl_daily_lineup_plan',
    ARRAY['text', 'text', 'smallint'],
    'daily plan initialization function exists'
);
SELECT has_function(
    'public',
    'save_cwl_daily_lineup_plan',
    ARRAY['text', 'text', 'smallint', 'integer', 'jsonb'],
    'daily plan save function exists'
);
SELECT has_function(
    'public',
    'set_cwl_daily_lineup_plan_lock',
    ARRAY['text', 'text', 'smallint', 'integer', 'boolean'],
    'daily plan lock function exists'
);
INSERT INTO auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data
)
VALUES (
    '60000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'lineup-leader@example.test',
    'x',
    now(),
    '{}',
    '{}'
);

INSERT INTO public.profiles (id, display_name)
VALUES ('60000000-0000-0000-0000-000000000001', 'Lineup Leader')
ON CONFLICT (id) DO UPDATE SET display_name = excluded.display_name;

INSERT INTO public.user_roles (user_id, role)
VALUES ('60000000-0000-0000-0000-000000000001', 'leader');

INSERT INTO public.cwl_seasons (clan_tag, season_id, war_size, target_core_size, rotation_positions)
VALUES ('#LINEUP', '2026-08', 15, 10, 5);

INSERT INTO public.cwl_members (clan_tag, season_id, player_tag, name, town_hall_level)
VALUES
    ('#LINEUP', '2026-08', '#ALPHA', 'Alpha', 17),
    ('#LINEUP', '2026-08', '#BRAVO', 'Bravo', 16),
    ('#LINEUP', '2026-08', '#CHARLIE', 'Charlie', 15);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

SELECT is(
    public.ensure_cwl_daily_lineup_plan('#LINEUP', '2026-08', 1::smallint) ->> 'revision',
    '1',
    'first day initializes at revision one'
);
SELECT is(
    public.save_cwl_daily_lineup_plan('#LINEUP', '2026-08', 1::smallint, 1, '["#ALPHA", "#BRAVO"]'::jsonb) ->> 'revision',
    '2',
    'saving an unlocked plan advances its revision'
);
SELECT is(
    (
        SELECT count(*)::integer
        FROM public.cwl_daily_lineup_plan_members
        WHERE clan_tag = '#LINEUP'
            AND season_id = '2026-08'
            AND war_day = 1
    ),
    2,
    'saving stores the ordered plan members'
);
SELECT is(
    public.ensure_cwl_daily_lineup_plan('#LINEUP', '2026-08', 2::smallint) ->> 'playerTags',
    '["#ALPHA", "#BRAVO"]',
    'a new day inherits the prior day once'
);
SELECT is(
    public.save_cwl_daily_lineup_plan('#LINEUP', '2026-08', 1::smallint, 2, '["#CHARLIE", "#ALPHA"]'::jsonb) ->> 'revision',
    '3',
    'earlier-day edits advance only the edited day'
);
SELECT is(
    public.ensure_cwl_daily_lineup_plan('#LINEUP', '2026-08', 2::smallint) ->> 'playerTags',
    '["#ALPHA", "#BRAVO"]',
    'later-day snapshots do not cascade earlier-day edits'
);
SELECT throws_ok(
    $$SELECT public.save_cwl_daily_lineup_plan('#LINEUP', '2026-08', 1::smallint, 2, '["#ALPHA"]'::jsonb)$$,
    '40001',
    'CWL lineup is stale; reload latest',
    'stale plan saves fail without overwriting current state'
);
SELECT is(
    public.set_cwl_daily_lineup_plan_lock('#LINEUP', '2026-08', 1::smallint, 3, true) ->> 'revision',
    '4',
    'locking advances the revision'
);
SELECT throws_ok(
    $$SELECT public.save_cwl_daily_lineup_plan('#LINEUP', '2026-08', 1::smallint, 4, '["#ALPHA"]'::jsonb)$$,
    'P0001',
    'CWL lineup is locked',
    'locked plan saves are rejected'
);
SELECT lives_ok(
    $$INSERT INTO public.member_availability (clan_tag, season_id, player_tag, status, recorded_by)
      VALUES ('#LINEUP', '2026-08', '#ALPHA', 'available', auth.uid())$$,
    'availability remains editable while the plan is locked'
);
SELECT is(
    public.set_cwl_daily_lineup_plan_lock('#LINEUP', '2026-08', 1::smallint, 4, false) ->> 'revision',
    '5',
    'unlocking advances the revision'
);
SELECT is(
    public.reinherit_cwl_daily_lineup_plan('#LINEUP', '2026-08', 2::smallint, 1) ->> 'revision',
    '2',
    'explicit re-inheritance advances the target revision'
);
SELECT is(
    public.ensure_cwl_daily_lineup_plan('#LINEUP', '2026-08', 2::smallint) ->> 'playerTags',
    '["#CHARLIE", "#ALPHA"]',
    'explicit re-inheritance copies the latest prior-day snapshot'
);
SELECT throws_ok(
    $$SELECT public.save_cwl_daily_lineup_plan('#LINEUP', '2026-08', 2::smallint, 2, '["#ALPHA", "#ALPHA"]'::jsonb)$$,
    'P0001',
    'A lineup cannot contain the same member twice',
    'duplicate lineup members are rejected'
);
SELECT throws_ok(
    $$SELECT public.save_cwl_daily_lineup_plan('#LINEUP', '2026-08', 2::smallint, 2, '["#UNKNOWN"]'::jsonb)$$,
    'P0001',
    'Lineup contains a member outside the season roster',
    'members outside the season roster are rejected'
);
SELECT is(
    (
        SELECT count(*)::integer
        FROM public.audit_events
        WHERE entity_type = 'cwl_daily_lineup_plan'
    ),
    7,
    'initialization and successful plan operations create compact audit events'
);
SELECT ok(
    EXISTS (
        SELECT 1
        FROM public.audit_events
        WHERE entity_type = 'cwl_daily_lineup_plan'
            AND event_type = 'lineup_plan_saved'
            AND event_data @> '{"previousPlayerTags":["#ALPHA","#BRAVO"],"playerTags":["#CHARLIE","#ALPHA"]}'::jsonb
    ),
    'saved lineup events retain the before-and-after lineup snapshot'
);

RESET ROLE;
SET LOCAL ROLE anon;
SELECT throws_ok(
    $$INSERT INTO public.cwl_daily_lineup_plans (clan_tag, season_id, war_day)
      VALUES ('#LINEUP', '2026-08', 3)$$,
    '42501',
    NULL,
    'anonymous users cannot write daily plans directly'
);

SELECT * FROM finish();
ROLLBACK;
