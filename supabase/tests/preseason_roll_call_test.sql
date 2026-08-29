BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(24);

SELECT has_table('public', 'cwl_roll_call', 'roll call staging table exists');
SELECT col_is_pk(
    'public',
    'cwl_roll_call',
    ARRAY['clan_tag', 'target_month', 'player_tag'],
    'a roll call entry is one member for one month'
);
SELECT has_column('public', 'member_availability', 'roll_call_at', 'availability carries the roll-call provenance marker');
SELECT has_function('public', 'cwl_season_month', ARRAY['text'], 'the SQL season-month reader exists');
SELECT has_function('public', 'seed_cwl_roll_call', ARRAY['text', 'text'], 'the seed function exists');
SELECT policies_are(
    'public',
    'cwl_roll_call',
    ARRAY['Leaders read roll call', 'Leaders write roll call'],
    'leaders read and write their own roll call entries'
);

-- The month reader, which is the join between a YYYY-MM roll call and a
-- YYYY-MM-DD season id (#91).
SELECT is(public.cwl_season_month('2026-09-01'), '2026-09', 'production ids are read as their month');
SELECT is(public.cwl_season_month('2026-09'), '2026-09', 'the short form is still accepted');
SELECT is(public.cwl_season_month('not-a-season'), NULL, 'an unreadable id is NULL rather than an error');
SELECT is(public.cwl_season_month('2026-13-01'), NULL, 'a month outside 1-12 is not a month');

INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data
)
VALUES (
    '70000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'roll-call-leader@example.test', 'x',
    now(), '{}', '{}'
);

INSERT INTO public.profiles (id, display_name)
VALUES ('70000000-0000-0000-0000-000000000001', 'Roll Call Leader')
ON CONFLICT (id) DO UPDATE SET display_name = excluded.display_name;

INSERT INTO public.user_roles (user_id, role)
VALUES ('70000000-0000-0000-0000-000000000001', 'leader');

-- The season the collector creates once the league group forms. Note the id is
-- the API's date form, while the roll call below is keyed by month.
INSERT INTO public.cwl_seasons (clan_tag, season_id, war_size, target_core_size, rotation_positions)
VALUES ('#ROLLCALL', '2026-09-01', 15, 10, 5);

-- DELTA is deliberately absent: it is in the roll call and not in the group,
-- which is the "said yes but did not make the signup" case.
INSERT INTO public.cwl_members (clan_tag, season_id, player_tag, name, town_hall_level)
VALUES
    ('#ROLLCALL', '2026-09-01', '#ALPHA', 'Alpha', 17),
    ('#ROLLCALL', '2026-09-01', '#BRAVO', 'Bravo', 16),
    ('#ROLLCALL', '2026-09-01', '#CHARLIE', 'Charlie', 15);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

SELECT is(
    public.seed_cwl_roll_call('#ROLLCALL', '2026-09-01') ->> 'seeded',
    '0',
    'a season with no roll call seeds nothing and does not fail'
);

-- The roll call as the leader writes it on 29 August, before any September data
-- exists. CHARLIE is deliberately left out: nobody liked the message on their
-- behalf, and silence stays unknown rather than becoming unavailable.
INSERT INTO public.cwl_roll_call (clan_tag, target_month, player_tag, recorded_by, recorded_at)
VALUES
    ('#ROLLCALL', '2026-09', '#ALPHA', '70000000-0000-0000-0000-000000000001', '2026-08-29T12:00:00Z'),
    ('#ROLLCALL', '2026-09', '#BRAVO', '70000000-0000-0000-0000-000000000001', '2026-08-29T13:00:00Z'),
    ('#ROLLCALL', '2026-09', '#DELTA', '70000000-0000-0000-0000-000000000001', '2026-08-29T14:00:00Z');

-- An orphan: August's roll call, whose season never landed.
INSERT INTO public.cwl_roll_call (clan_tag, target_month, player_tag, recorded_by, recorded_at)
VALUES ('#ROLLCALL', '2026-08', '#ALPHA', '70000000-0000-0000-0000-000000000001', '2026-07-30T12:00:00Z');

SELECT throws_ok(
    $$INSERT INTO public.cwl_roll_call (clan_tag, target_month, player_tag, recorded_by)
      VALUES ('#ROLLCALL', '2026-09-01', '#ALPHA', '70000000-0000-0000-0000-000000000001')$$,
    '23514',
    NULL,
    'the target month must be canonical YYYY-MM, so the season join cannot miss'
);

SELECT is(
    public.seed_cwl_roll_call('#ROLLCALL', '2026-09-01') ->> 'seeded',
    '2',
    'only members who are in the CWL group are seeded'
);

SELECT is(
    (SELECT status::text FROM public.member_availability
     WHERE clan_tag = '#ROLLCALL' AND season_id = '2026-09-01' AND player_tag = '#ALPHA'),
    'available',
    'a member who said yes arrives available for the collected season'
);

SELECT is(
    (SELECT roll_call_at FROM public.member_availability
     WHERE clan_tag = '#ROLLCALL' AND season_id = '2026-09-01' AND player_tag = '#ALPHA'),
    '2026-08-29T12:00:00Z'::timestamptz,
    'the provenance marker carries when that member actually said yes'
);

SELECT ok(
    NOT EXISTS (
        SELECT 1 FROM public.member_availability
        WHERE clan_tag = '#ROLLCALL' AND season_id = '2026-09-01' AND player_tag = '#CHARLIE'
    ),
    'silence is left unknown rather than written as an answer'
);

SELECT is(
    public.seed_cwl_roll_call('#ROLLCALL', '2026-09-01') ->> 'unmatched',
    '["#DELTA"]',
    'someone who said yes but is not in the group is reported, not written'
);

SELECT ok(
    NOT EXISTS (
        SELECT 1 FROM public.cwl_roll_call
        WHERE clan_tag = '#ROLLCALL' AND target_month = '2026-08'
    ),
    'a roll call whose season never landed is discarded silently'
);

SELECT is(
    (SELECT count(*)::integer FROM public.cwl_roll_call
     WHERE clan_tag = '#ROLLCALL' AND target_month = '2026-09'),
    3,
    'the seeded month survives so the surface can keep naming who did not make the group'
);

SELECT is(
    public.seed_cwl_roll_call('#ROLLCALL', '2026-09-01') ->> 'seeded',
    '0',
    'seeding is idempotent, so every season load can call it'
);

-- What `saveAvailability` does: an upsert that names status, actor and time and
-- says nothing about the provenance column.
INSERT INTO public.member_availability (clan_tag, season_id, player_tag, status, recorded_by, recorded_at)
VALUES ('#ROLLCALL', '2026-09-01', '#ALPHA', 'unavailable', '70000000-0000-0000-0000-000000000001', now())
ON CONFLICT (clan_tag, season_id, player_tag) DO UPDATE
SET status = excluded.status, recorded_by = excluded.recorded_by, recorded_at = excluded.recorded_at;

SELECT is(
    (SELECT roll_call_at FROM public.member_availability
     WHERE clan_tag = '#ROLLCALL' AND season_id = '2026-09-01' AND player_tag = '#ALPHA'),
    '2026-08-29T12:00:00Z'::timestamptz,
    'a withdrawal does not erase the promise: the marker survives the status flip'
);

SELECT is(
    (SELECT status::text FROM public.member_availability
     WHERE clan_tag = '#ROLLCALL' AND season_id = '2026-09-01' AND player_tag = '#ALPHA'),
    'unavailable',
    'and the status flip IS the withdrawal record, so no second table is needed'
);

SELECT is(
    public.seed_cwl_roll_call('#ROLLCALL', '2026-09-01') ->> 'seeded',
    '0',
    'a re-seed after a leader edit does not undo the edit'
);

SELECT is(
    (SELECT status::text FROM public.member_availability
     WHERE clan_tag = '#ROLLCALL' AND season_id = '2026-09-01' AND player_tag = '#ALPHA'),
    'unavailable',
    'the leader''s own answer outranks the roll call once the season is running'
);

SELECT * FROM finish();

ROLLBACK;
