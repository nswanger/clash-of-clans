BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(14);

SELECT has_column(
    'public',
    'cwl_seasons',
    'bonuses_administered_at',
    'the season carries whether its bonus medals were handed out'
);
SELECT col_is_null(
    'public',
    'cwl_seasons',
    'bonuses_administered_at',
    'not administered is the absence of an instant, not a false'
);
SELECT has_function(
    'public',
    'set_cwl_bonuses_administered',
    ARRAY['text', 'text', 'boolean'],
    'bonus administration is recorded through a protected function'
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
    '80000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'bonus-administration-leader@example.test',
    'x',
    now(),
    '{}',
    '{}'
);

INSERT INTO public.profiles (id, display_name)
VALUES ('80000000-0000-0000-0000-000000000001', 'Bonus Administration Leader')
ON CONFLICT (id) DO UPDATE SET display_name = excluded.display_name;

INSERT INTO public.user_roles (user_id, role)
VALUES ('80000000-0000-0000-0000-000000000001', 'leader');

INSERT INTO public.cwl_seasons (clan_tag, season_id, war_size, target_core_size, rotation_positions)
VALUES ('#BONUS', '2026-08', 15, 10, 5);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '80000000-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

SELECT is(
    (SELECT bonuses_administered_at FROM public.cwl_seasons WHERE clan_tag = '#BONUS' AND season_id = '2026-08'),
    NULL,
    'a new season has not administered its bonuses'
);

SELECT ok(
    (public.set_cwl_bonuses_administered('#BONUS', '2026-08', true) ->> 'bonusesAdministeredAt') IS NOT NULL,
    'marking the season records an instant'
);

-- The instant answers "when were they handed out", so a second tap on a control
-- that is already on must not move it.
SELECT is(
    (public.set_cwl_bonuses_administered('#BONUS', '2026-08', true) ->> 'bonusesAdministeredAt')::timestamptz,
    (SELECT bonuses_administered_at FROM public.cwl_seasons WHERE clan_tag = '#BONUS' AND season_id = '2026-08'),
    'marking an already-marked season is idempotent rather than moving the instant'
);

SELECT is(
    (SELECT count(*)::int FROM public.audit_events WHERE entity_type = 'cwl_season' AND event_type = 'cwl_bonuses_administered'),
    1,
    'a re-tap that changes nothing is not audited as a second handout'
);

SELECT is(
    public.set_cwl_bonuses_administered('#BONUS', '2026-08', false) ->> 'bonusesAdministeredAt',
    NULL,
    'a mistap is recoverable — clearing returns the season to not administered'
);

SELECT ok(
    EXISTS (
        SELECT 1
        FROM public.audit_events
        WHERE entity_type = 'cwl_season'
            AND event_type = 'cwl_bonuses_administration_cleared'
            AND entity_id = '#BONUS:2026-08'
    ),
    'clearing the flag is audited as its own act'
);

SELECT is(
    (SELECT actor_id FROM public.audit_events
     WHERE entity_type = 'cwl_season' AND event_type = 'cwl_bonuses_administered'),
    '80000000-0000-0000-0000-000000000001'::uuid,
    'the acting leader is recorded on the event, so the season needs no _by column'
);

SELECT throws_ok(
    $$SELECT public.set_cwl_bonuses_administered('#MISSING', '2026-08', true)$$,
    NULL,
    'CWL season was not found',
    'an unknown season is rejected rather than silently created'
);

SELECT throws_ok(
    $$UPDATE public.cwl_seasons SET bonuses_administered_at = now() WHERE clan_tag = '#BONUS'$$,
    '42501',
    NULL,
    'leaders cannot write the flag directly, only through the function'
);

RESET ROLE;

INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data
)
VALUES (
    '80000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'bonus-administration-outsider@example.test', 'x', now(), '{}', '{}'
);

INSERT INTO public.profiles (id, display_name)
VALUES ('80000000-0000-0000-0000-000000000002', 'Signed In Outsider')
ON CONFLICT (id) DO UPDATE SET display_name = excluded.display_name;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '80000000-0000-0000-0000-000000000002', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

SELECT throws_ok(
    $$SELECT public.set_cwl_bonuses_administered('#BONUS', '2026-08', true)$$,
    '42501',
    'Leader access required',
    'a signed-in user with no leader role is refused by the function'
);

RESET ROLE;
SET LOCAL ROLE anon;

-- Anon is stopped by the GRANT rather than by `is_leader()`, one layer earlier
-- than the check above. Asserting the code rather than the message records that
-- distinction instead of hiding it behind a shared expectation.
SELECT throws_ok(
    $$SELECT public.set_cwl_bonuses_administered('#BONUS', '2026-08', true)$$,
    '42501',
    NULL,
    'anonymous users cannot execute the function at all'
);

SELECT * FROM finish();
ROLLBACK;
