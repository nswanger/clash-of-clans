BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(24);

SELECT has_column('public', 'cwl_daily_lineup_plans', 'seed_source', 'daily plans record where their membership came from');
SELECT has_function(
    'public',
    'cwl_observed_lineup_members',
    ARRAY['text', 'text', 'smallint'],
    'observed lineup helper exists'
);
SELECT has_function('public', 'sync_cwl_daily_lineup_plan_from_observation', 'observation sync for daily plans exists');
SELECT has_trigger('public', 'cwl_war_members', 'cwl_war_members_insert_sync_lineup_plan', 'inserting war members syncs daily plans');
SELECT has_trigger('public', 'cwl_war_members', 'cwl_war_members_update_sync_lineup_plan', 'updating war members syncs daily plans');

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
    '80000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'seed-leader@example.test',
    'x',
    now(),
    '{}',
    '{}'
);

INSERT INTO public.profiles (id, display_name)
VALUES ('80000000-0000-0000-0000-000000000001', 'Seed Leader')
ON CONFLICT (id) DO UPDATE SET display_name = excluded.display_name;

INSERT INTO public.user_roles (user_id, role)
VALUES ('80000000-0000-0000-0000-000000000001', 'leader');

INSERT INTO public.cwl_seasons (clan_tag, season_id, war_size, target_core_size, rotation_positions)
VALUES ('#SEED', '2026-09', 15, 10, 5);

INSERT INTO public.cwl_members (clan_tag, season_id, player_tag, name, town_hall_level)
SELECT
    '#SEED',
    '2026-09',
    format('#S%s', lpad(seq::text, 2, '0')),
    format('Seed %s', seq),
    16
FROM generate_series(1, 20) AS seq;

-- Day 1 was collected before any leader opened it. Map positions are stored out
-- of member order so the test shows the plan follows the map, not the tag.
INSERT INTO public.cwl_wars (war_tag, clan_tag, season_id, war_day, state)
VALUES ('#SEEDW1', '#SEED', '2026-09', 1, 'inWar');

INSERT INTO public.cwl_war_members (war_tag, player_tag, map_position, assigned_attacks)
SELECT '#SEEDW1', format('#S%s', lpad(seq::text, 2, '0')), (16 - seq)::smallint, 1
FROM generate_series(1, 15) AS seq;

-- A roster member the season roster never recorded must not break seeding.
INSERT INTO public.cwl_war_members (war_tag, player_tag, map_position, assigned_attacks)
VALUES ('#SEEDW1', '#UNKNOWN', 16, 1);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '80000000-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

SELECT is(
    public.ensure_cwl_daily_lineup_plan('#SEED', '2026-09', 1::smallint) ->> 'seedSource',
    'observed',
    'day 1 opened after collection is seeded from the observed roster'
);
SELECT is(
    jsonb_array_length(public.ensure_cwl_daily_lineup_plan('#SEED', '2026-09', 1::smallint) -> 'playerTags'),
    15,
    'the observed roster fills the plan, skipping members the season roster does not know'
);
SELECT is(
    public.ensure_cwl_daily_lineup_plan('#SEED', '2026-09', 1::smallint) -> 'playerTags' -> 0,
    '"#S15"'::jsonb,
    'observed plan order follows map position'
);
SELECT is(
    public.ensure_cwl_daily_lineup_plan('#SEED', '2026-09', 1::smallint) -> 'inheritedFromWarDay',
    'null'::jsonb,
    'an observed plan does not claim inheritance'
);
SELECT is(
    public.ensure_cwl_daily_lineup_plan('#SEED', '2026-09', 1::smallint) -> 'revision',
    '1'::jsonb,
    'seeding on open is the initial revision, not an edit'
);
SELECT ok(
    EXISTS (
        SELECT 1
        FROM public.audit_events
        WHERE entity_type = 'cwl_daily_lineup_plan'
            AND entity_id = '#SEED:2026-09:1'
            AND event_type = 'lineup_plan_initialized'
            AND event_data @> '{"seedSource":"observed","memberCount":15}'::jsonb
    ),
    'initialization records the observed provenance'
);

-- Day 2 has no war yet: it inherits day 1 as before.
SELECT is(
    public.ensure_cwl_daily_lineup_plan('#SEED', '2026-09', 2::smallint) ->> 'seedSource',
    'inherited',
    'an unobserved later day still inherits the prior plan'
);
SELECT is(
    public.ensure_cwl_daily_lineup_plan('#SEED', '2026-09', 2::smallint) -> 'inheritedFromWarDay',
    '1'::jsonb,
    'inheritance provenance is unchanged'
);

-- A season with nothing collected opens day 1 empty, as it always has.
RESET ROLE;
INSERT INTO public.cwl_seasons (clan_tag, season_id, war_size, target_core_size, rotation_positions)
VALUES ('#SEED', '2026-10', 15, 10, 5);
INSERT INTO public.cwl_members (clan_tag, season_id, player_tag, name, town_hall_level)
SELECT '#SEED', '2026-10', format('#S%s', lpad(seq::text, 2, '0')), format('Seed %s', seq), 16
FROM generate_series(1, 20) AS seq;
SET LOCAL ROLE authenticated;

SELECT is(
    public.ensure_cwl_daily_lineup_plan('#SEED', '2026-10', 1::smallint) ->> 'seedSource',
    'empty',
    'day 1 without an observed war opens empty'
);
SELECT is(
    jsonb_array_length(public.ensure_cwl_daily_lineup_plan('#SEED', '2026-10', 1::smallint) -> 'playerTags'),
    0,
    'an empty day has no members'
);

-- Leader opens day 2 of that season (inherits the empty day 1) and saves a real plan.
DO $$
BEGIN
    PERFORM public.ensure_cwl_daily_lineup_plan('#SEED', '2026-10', 2::smallint);
    PERFORM public.save_cwl_daily_lineup_plan(
        '#SEED',
        '2026-10',
        2::smallint,
        1,
        '["#S01", "#S02", "#S03"]'::jsonb
    );
END;
$$;

RESET ROLE;

-- Collection now records day 1 and day 2 of October in one statement.
INSERT INTO public.cwl_wars (war_tag, clan_tag, season_id, war_day, state)
VALUES
    ('#SEEDW1O', '#SEED', '2026-10', 1, 'inWar'),
    ('#SEEDW2O', '#SEED', '2026-10', 2, 'preparation');

INSERT INTO public.cwl_war_members (war_tag, player_tag, map_position, assigned_attacks)
SELECT '#SEEDW1O', format('#S%s', lpad(seq::text, 2, '0')), seq::smallint, 1
FROM generate_series(6, 20) AS seq
UNION ALL
SELECT '#SEEDW2O', format('#S%s', lpad(seq::text, 2, '0')), seq::smallint, 1
FROM generate_series(6, 20) AS seq;

SET LOCAL ROLE authenticated;

SELECT is(
    public.ensure_cwl_daily_lineup_plan('#SEED', '2026-10', 1::smallint) ->> 'seedSource',
    'observed',
    'an empty untouched plan is filled when its war is collected'
);
SELECT is(
    public.ensure_cwl_daily_lineup_plan('#SEED', '2026-10', 1::smallint) -> 'playerTags' -> 0,
    '"#S06"'::jsonb,
    'the filled plan follows the observed map order'
);
SELECT is(
    public.ensure_cwl_daily_lineup_plan('#SEED', '2026-10', 1::smallint) -> 'revision',
    '2'::jsonb,
    'filling from observation advances the revision so open editors reload'
);
SELECT ok(
    EXISTS (
        SELECT 1
        FROM public.audit_events
        WHERE entity_type = 'cwl_daily_lineup_plan'
            AND entity_id = '#SEED:2026-10:1'
            AND event_type = 'lineup_plan_observed'
            AND actor_id IS NULL
            AND event_data @> '{"seedSource":"observed","memberCount":15}'::jsonb
    ),
    'filling from observation is audited without a human actor'
);

SELECT is(
    public.ensure_cwl_daily_lineup_plan('#SEED', '2026-10', 2::smallint) -> 'playerTags',
    '["#S01", "#S02", "#S03"]'::jsonb,
    'a plan a leader has saved is left alone when its war is collected'
);
SELECT is(
    public.ensure_cwl_daily_lineup_plan('#SEED', '2026-10', 2::smallint) ->> 'seedSource',
    'inherited',
    'a saved plan keeps its original provenance'
);

-- Day 3 of October is opened after both days exist: observation on day 2 does
-- not matter here, but a collected day 3 would win over inheritance.
RESET ROLE;
INSERT INTO public.cwl_wars (war_tag, clan_tag, season_id, war_day, state)
VALUES ('#SEEDW3O', '#SEED', '2026-10', 3, 'preparation');
INSERT INTO public.cwl_war_members (war_tag, player_tag, map_position, assigned_attacks)
SELECT '#SEEDW3O', format('#S%s', lpad(seq::text, 2, '0')), seq::smallint, 1
FROM generate_series(1, 15) AS seq;
SET LOCAL ROLE authenticated;

SELECT is(
    public.ensure_cwl_daily_lineup_plan('#SEED', '2026-10', 3::smallint) ->> 'seedSource',
    'observed',
    'a later day opened after its war is collected seeds from observation, not the prior day'
);
SELECT is(
    jsonb_array_length(public.ensure_cwl_daily_lineup_plan('#SEED', '2026-10', 3::smallint) -> 'playerTags'),
    15,
    'observation wins over the three-member inherited plan'
);

RESET ROLE;
SET LOCAL ROLE anon;
SELECT throws_ok(
    $$SELECT * FROM public.cwl_observed_lineup_members('#SEED', '2026-09', 1::smallint)$$,
    '42501',
    NULL,
    'anonymous users cannot read the observed lineup helper'
);

SELECT * FROM finish();
ROLLBACK;
