BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(42);

SELECT has_table('public', 'cwl_applied_lineup_baselines', 'applied lineup baseline table exists');
SELECT has_table('public', 'cwl_applied_lineup_base_members', 'applied lineup base member table exists');
SELECT has_table('public', 'cwl_applied_lineup_changes', 'applied lineup change table exists');
SELECT col_is_pk(
    'public',
    'cwl_applied_lineup_baselines',
    ARRAY['clan_tag', 'season_id', 'war_day'],
    'baseline identity is season and war day'
);
SELECT col_is_pk(
    'public',
    'cwl_applied_lineup_changes',
    ARRAY['clan_tag', 'season_id', 'war_day', 'change_sequence'],
    'applied changes are ordered within one war day'
);
SELECT policies_are(
    'public',
    'cwl_applied_lineup_baselines',
    ARRAY['Leaders read applied lineup baselines'],
    'leaders can read baselines while protected functions own writes'
);
SELECT has_function(
    'public',
    'ensure_cwl_applied_lineup',
    ARRAY['text', 'text', 'smallint'],
    'baseline initialization function exists'
);
SELECT has_function(
    'public',
    'record_cwl_applied_lineup_change',
    ARRAY['text', 'text', 'smallint', 'text', 'text'],
    'check-off function exists'
);
SELECT has_function(
    'public',
    'undo_cwl_applied_lineup_change',
    ARRAY['text', 'text', 'smallint', 'integer'],
    'undo function exists'
);
SELECT has_function(
    'public',
    'clear_cwl_applied_lineup_changes',
    ARRAY['text', 'text', 'smallint'],
    'checklist history fold function exists'
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
    '70000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'applied-lineup-leader@example.test',
    'x',
    now(),
    '{}',
    '{}'
);

INSERT INTO public.profiles (id, display_name)
VALUES ('70000000-0000-0000-0000-000000000001', 'Applied Lineup Leader')
ON CONFLICT (id) DO UPDATE SET display_name = excluded.display_name;

INSERT INTO public.user_roles (user_id, role)
VALUES ('70000000-0000-0000-0000-000000000001', 'leader');

INSERT INTO public.cwl_seasons (clan_tag, season_id, war_size, target_core_size, rotation_positions)
VALUES ('#APPLIED', '2026-08', 15, 10, 5);

INSERT INTO public.cwl_members (clan_tag, season_id, player_tag, name, town_hall_level)
SELECT
    '#APPLIED',
    '2026-08',
    format('#M%s', lpad(seq::text, 2, '0')),
    format('Member %s', seq),
    16
FROM generate_series(1, 16) AS seq;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

DO $$
BEGIN
    PERFORM public.ensure_cwl_daily_lineup_plan('#APPLIED', '2026-08', 1::smallint);
    PERFORM public.save_cwl_daily_lineup_plan(
        '#APPLIED',
        '2026-08',
        1::smallint,
        1,
        (SELECT jsonb_agg(format('#M%s', lpad(seq::text, 2, '0')) ORDER BY seq) FROM generate_series(1, 15) AS seq)
    );
END;
$$;

SELECT is(
    public.ensure_cwl_applied_lineup('#APPLIED', '2026-08', 1::smallint) ->> 'baseSource',
    'plan',
    'a day with no observed roster assumes the game holds the plan'
);
SELECT is(
    jsonb_array_length(public.ensure_cwl_applied_lineup('#APPLIED', '2026-08', 1::smallint) -> 'playerTags'),
    15,
    'the assumed baseline is the saved plan membership'
);

-- Saving the plan is what used to destroy the checklist: the plan of record
-- advances, the game has not moved, so the baseline must not move with it.
DO $$
BEGIN
    PERFORM public.save_cwl_daily_lineup_plan(
        '#APPLIED',
        '2026-08',
        1::smallint,
        2,
        (
            SELECT jsonb_agg(planned.tag ORDER BY planned.position)
            FROM (
                SELECT format('#M%s', lpad(seq::text, 2, '0')) AS tag, seq AS position
                FROM generate_series(1, 14) AS seq
                UNION ALL
                SELECT '#M16', 15
            ) AS planned
        )
    );
END;
$$;

SELECT ok(
    (public.ensure_cwl_applied_lineup('#APPLIED', '2026-08', 1::smallint) -> 'playerTags') @> '["#M15"]'::jsonb
        AND NOT (public.ensure_cwl_applied_lineup('#APPLIED', '2026-08', 1::smallint) -> 'playerTags') @> '["#M16"]'::jsonb,
    'saving the plan leaves the baseline where the game still is'
);
SELECT is(
    public.ensure_cwl_applied_lineup('#APPLIED', '2026-08', 1::smallint) ->> 'revision',
    '1',
    'a plan save does not advance the baseline revision'
);

SELECT is(
    public.record_cwl_applied_lineup_change('#APPLIED', '2026-08', 1::smallint, '#M15', '#M16') ->> 'revision',
    '2',
    'checking off a swap advances the baseline revision'
);
SELECT ok(
    (public.ensure_cwl_applied_lineup('#APPLIED', '2026-08', 1::smallint) -> 'playerTags') @> '["#M16"]'::jsonb
        AND NOT (public.ensure_cwl_applied_lineup('#APPLIED', '2026-08', 1::smallint) -> 'playerTags') @> '["#M15"]'::jsonb,
    'a recorded swap moves the baseline to what the game now holds'
);
SELECT is(
    jsonb_array_length(public.ensure_cwl_applied_lineup('#APPLIED', '2026-08', 1::smallint) -> 'appliedChanges'),
    1,
    'the recorded act is kept as an undoable row'
);
SELECT is(
    public.record_cwl_applied_lineup_change('#APPLIED', '2026-08', 1::smallint, '#M15', '#M16') ->> 'revision',
    '2',
    'repeating a recorded change is a retry rather than a second physical act'
);

-- The record is of physical acts, so reverting the plan underneath it leaves it
-- true; the change correctly reappears as a fresh instruction the other way.
DO $$
BEGIN
    PERFORM public.save_cwl_daily_lineup_plan(
        '#APPLIED',
        '2026-08',
        1::smallint,
        3,
        (SELECT jsonb_agg(format('#M%s', lpad(seq::text, 2, '0')) ORDER BY seq) FROM generate_series(1, 15) AS seq)
    );
END;
$$;

SELECT ok(
    (public.ensure_cwl_applied_lineup('#APPLIED', '2026-08', 1::smallint) -> 'playerTags') @> '["#M16"]'::jsonb,
    'a plan revert does not cancel out the change the leader already made'
);

SELECT throws_ok(
    $$SELECT public.record_cwl_applied_lineup_change('#APPLIED', '2026-08', 1::smallint, '#M15', NULL)$$,
    'P0001',
    'Applied change removes a member the game is not known to hold',
    'a check-off that contradicts the baseline is rejected'
);
SELECT throws_ok(
    $$SELECT public.record_cwl_applied_lineup_change('#APPLIED', '2026-08', 1::smallint, NULL, '#M01')$$,
    'P0001',
    'Applied change adds a member the game already holds',
    'adding a member the game already holds is rejected'
);
SELECT throws_ok(
    $$SELECT public.record_cwl_applied_lineup_change('#APPLIED', '2026-08', 1::smallint, NULL, '#UNKNOWN')$$,
    'P0001',
    'Applied change adds a member outside the season roster',
    'members outside the season roster cannot be checked off'
);
SELECT throws_ok(
    $$SELECT public.record_cwl_applied_lineup_change('#APPLIED', '2026-08', 1::smallint, NULL, '#M15')$$,
    'P0001',
    'The game cannot hold more than the season war size',
    'an add at war size cannot describe anything the game would allow'
);
SELECT throws_ok(
    $$SELECT public.record_cwl_applied_lineup_change('#APPLIED', '2026-08', 1::smallint, NULL, NULL)$$,
    'P0001',
    'An applied change must remove or add a member',
    'an empty change is rejected'
);

SELECT is(
    public.undo_cwl_applied_lineup_change('#APPLIED', '2026-08', 1::smallint, 1) ->> 'revision',
    '3',
    'undoing a change advances the baseline revision'
);
SELECT ok(
    (public.ensure_cwl_applied_lineup('#APPLIED', '2026-08', 1::smallint) -> 'playerTags') @> '["#M15"]'::jsonb
        AND NOT (public.ensure_cwl_applied_lineup('#APPLIED', '2026-08', 1::smallint) -> 'playerTags') @> '["#M16"]'::jsonb,
    'undo returns the baseline to what it held before the act'
);
SELECT is(
    public.undo_cwl_applied_lineup_change('#APPLIED', '2026-08', 1::smallint, 1) ->> 'revision',
    '3',
    'undoing an already undone change is a retry rather than an error'
);

DO $$
BEGIN
    PERFORM public.record_cwl_applied_lineup_change('#APPLIED', '2026-08', 1::smallint, '#M15', '#M16');
END;
$$;

SELECT is(
    public.clear_cwl_applied_lineup_changes('#APPLIED', '2026-08', 1::smallint) ->> 'baseSource',
    'confirmed',
    'folding the checklist history records that the base is leader-confirmed'
);
SELECT is(
    jsonb_array_length(public.ensure_cwl_applied_lineup('#APPLIED', '2026-08', 1::smallint) -> 'appliedChanges'),
    0,
    'folding leaves no rows to undo'
);
SELECT ok(
    (public.ensure_cwl_applied_lineup('#APPLIED', '2026-08', 1::smallint) -> 'playerTags') @> '["#M16"]'::jsonb
        AND jsonb_array_length(public.ensure_cwl_applied_lineup('#APPLIED', '2026-08', 1::smallint) -> 'playerTags') = 15,
    'folding leaves the same effective baseline'
);

DO $$
BEGIN
    PERFORM public.record_cwl_applied_lineup_change('#APPLIED', '2026-08', 1::smallint, '#M01', NULL);
END;
$$;

RESET ROLE;

-- Collection observes the war roster. It is ground truth, so it replaces the
-- baseline wholesale instead of ticking items off it.
INSERT INTO public.cwl_wars (war_tag, clan_tag, season_id, war_day, state)
VALUES ('#WARD1', '#APPLIED', '2026-08', 1, 'inWar');

INSERT INTO public.cwl_war_members (war_tag, player_tag, map_position, assigned_attacks)
SELECT '#WARD1', format('#M%s', lpad(seq::text, 2, '0')), (seq - 1)::smallint, 1
FROM generate_series(2, 16) AS seq;

SET LOCAL ROLE authenticated;

SELECT is(
    public.ensure_cwl_applied_lineup('#APPLIED', '2026-08', 1::smallint) ->> 'baseSource',
    'observed',
    'an observed war roster becomes the baseline'
);
SELECT ok(
    NOT (public.ensure_cwl_applied_lineup('#APPLIED', '2026-08', 1::smallint) -> 'playerTags') @> '["#M01"]'::jsonb
        AND jsonb_array_length(public.ensure_cwl_applied_lineup('#APPLIED', '2026-08', 1::smallint) -> 'playerTags') = 15,
    'observation replaces the baseline rather than merging into it'
);
SELECT is(
    jsonb_array_length(public.ensure_cwl_applied_lineup('#APPLIED', '2026-08', 1::smallint) -> 'appliedChanges'),
    0,
    'observation clears the checklist history it supersedes'
);

RESET ROLE;

INSERT INTO public.cwl_war_members (war_tag, player_tag, map_position, assigned_attacks)
SELECT '#WARD1', format('#M%s', lpad(seq::text, 2, '0')), (seq - 1)::smallint, 2
FROM generate_series(2, 16) AS seq
ON CONFLICT (war_tag, player_tag) DO UPDATE SET assigned_attacks = excluded.assigned_attacks;

-- A day nobody has opened yet gets no baseline row from collection; it seeds
-- from the same observation when a leader first opens it.
INSERT INTO public.cwl_wars (war_tag, clan_tag, season_id, war_day, state)
VALUES ('#WARD2', '#APPLIED', '2026-08', 2, 'preparation');

INSERT INTO public.cwl_war_members (war_tag, player_tag, map_position, assigned_attacks)
SELECT '#WARD2', format('#M%s', lpad(seq::text, 2, '0')), seq::smallint, 1
FROM generate_series(1, 3) AS seq;

SELECT is(
    (
        SELECT count(*)::integer
        FROM public.cwl_applied_lineup_baselines
        WHERE clan_tag = '#APPLIED' AND season_id = '2026-08' AND war_day = 2
    ),
    0,
    'collection does not create baselines for days no leader has opened'
);

SET LOCAL ROLE authenticated;

SELECT is(
    public.ensure_cwl_applied_lineup('#APPLIED', '2026-08', 1::smallint) ->> 'revision',
    '7',
    'a repeated observation of the same roster does not advance the revision'
);
SELECT is(
    public.ensure_cwl_applied_lineup('#APPLIED', '2026-08', 2::smallint) ->> 'baseSource',
    'observed',
    'a first open seeds from the observed roster when one exists'
);
SELECT is(
    jsonb_array_length(public.ensure_cwl_applied_lineup('#APPLIED', '2026-08', 2::smallint) -> 'playerTags'),
    3,
    'the seeded baseline is the observed roster'
);

-- Any recorded act can be undone, not only the most recent one, so undoing an
-- earlier act has to leave the later act's effect standing on its own.
DO $$
BEGIN
    PERFORM public.ensure_cwl_daily_lineup_plan('#APPLIED', '2026-08', 3::smallint);
    PERFORM public.ensure_cwl_applied_lineup('#APPLIED', '2026-08', 3::smallint);
    PERFORM public.record_cwl_applied_lineup_change('#APPLIED', '2026-08', 3::smallint, '#M01', '#M16');
    PERFORM public.record_cwl_applied_lineup_change('#APPLIED', '2026-08', 3::smallint, '#M02', NULL);
    PERFORM public.undo_cwl_applied_lineup_change('#APPLIED', '2026-08', 3::smallint, 1);
END;
$$;

SELECT ok(
    (public.ensure_cwl_applied_lineup('#APPLIED', '2026-08', 3::smallint) -> 'playerTags') @> '["#M01"]'::jsonb
        AND NOT (public.ensure_cwl_applied_lineup('#APPLIED', '2026-08', 3::smallint) -> 'playerTags') @> '["#M16"]'::jsonb
        AND NOT (public.ensure_cwl_applied_lineup('#APPLIED', '2026-08', 3::smallint) -> 'playerTags') @> '["#M02"]'::jsonb,
    'undoing an earlier act keeps a later act that outlived it'
);

-- The collector's own ingestion path replaces a war's members by deleting them
-- and reinserting, so the baseline has to follow the final roster rather than
-- the empty moment in the middle of that pair.
DO $$
BEGIN
    PERFORM public.ensure_cwl_daily_lineup_plan('#APPLIED', '2026-08', 4::smallint);
    PERFORM public.ensure_cwl_applied_lineup('#APPLIED', '2026-08', 4::smallint);
END;
$$;

RESET ROLE;

SELECT public.apply_cwl_war_unit(
    jsonb_build_object(
        'war_tag', '#WARD4',
        'clan_tag', '#APPLIED',
        'season_id', '2026-08',
        'war_day', 4,
        'state', 'inWar'
    ),
    (
        SELECT jsonb_agg(
            jsonb_build_object(
                'war_tag', '#WARD4',
                'player_tag', format('#M%s', lpad(seq::text, 2, '0')),
                'map_position', seq,
                'town_hall_level', 16,
                'assigned_attacks', 1
            )
        )
        FROM generate_series(1, 5) AS seq
    ),
    '[]'::jsonb
);

SELECT public.apply_cwl_war_unit(
    jsonb_build_object(
        'war_tag', '#WARD4',
        'clan_tag', '#APPLIED',
        'season_id', '2026-08',
        'war_day', 4,
        'state', 'inWar'
    ),
    (
        SELECT jsonb_agg(
            jsonb_build_object(
                'war_tag', '#WARD4',
                'player_tag', format('#M%s', lpad(seq::text, 2, '0')),
                'map_position', seq - 5,
                'town_hall_level', 16,
                'assigned_attacks', 2
            )
        )
        FROM generate_series(6, 8) AS seq
    ),
    '[]'::jsonb
);

SET LOCAL ROLE authenticated;

SELECT is(
    public.ensure_cwl_applied_lineup('#APPLIED', '2026-08', 4::smallint) -> 'playerTags',
    '["#M06", "#M07", "#M08"]'::jsonb,
    'a corrected war roster leaves the baseline holding the corrected members'
);

SELECT ok(
    EXISTS (
        SELECT 1
        FROM public.audit_events
        WHERE entity_type = 'cwl_applied_lineup'
            AND event_type = 'applied_lineup_observed'
            AND entity_id = '#APPLIED:2026-08:1'
    ),
    'observation replacing a baseline is audited'
);
SELECT ok(
    EXISTS (
        SELECT 1
        FROM public.audit_events
        WHERE entity_type = 'cwl_applied_lineup'
            AND event_type = 'applied_lineup_change_recorded'
            AND event_data @> '{"removedPlayerTag":"#M15","addedPlayerTag":"#M16"}'::jsonb
    ),
    'recorded check-offs retain which members moved'
);

RESET ROLE;
SET LOCAL ROLE anon;
SELECT throws_ok(
    $$INSERT INTO public.cwl_applied_lineup_baselines (clan_tag, season_id, war_day, base_source)
      VALUES ('#APPLIED', '2026-08', 3, 'plan')$$,
    '42501',
    NULL,
    'anonymous users cannot write baselines directly'
);

SELECT * FROM finish();
ROLLBACK;
