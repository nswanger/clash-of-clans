BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(7);

SELECT has_column(
    'public',
    'regular_wars',
    'finalization_status',
    'regular wars expose finalization status'
);
SELECT has_column(
    'public',
    'regular_wars',
    'last_observed_at',
    'regular wars retain the last member-evidence timestamp'
);

INSERT INTO public.regular_wars (
    war_key,
    clan_tag,
    state,
    end_time,
    last_observed_at
)
VALUES (
    '#FINALIZED-AT-TRANSITION',
    '#FINALIZATION',
    'inWar',
    '2026-08-09T12:00:00Z',
    '2026-08-09T12:00:00Z'
);

SELECT is(
    public.finalize_regular_war_at_transition(
        '#FINALIZATION',
        '2026-08-09T12:00:05Z',
        NULL
    ),
    'complete_at_transition',
    'a notInWar transition is complete when member evidence reaches endTime'
);

SELECT is(
    (
        SELECT finalization_status
        FROM public.regular_wars
        WHERE war_key = '#FINALIZED-AT-TRANSITION'
    ),
    'complete_at_transition',
    'a correct end-of-war poll is not flagged incomplete'
);

INSERT INTO public.regular_wars (
    war_key,
    clan_tag,
    state,
    end_time,
    last_observed_at
)
VALUES (
    '#INCOMPLETE-TRANSITION',
    '#INCOMPLETION',
    'inWar',
    '2026-08-09T12:00:00Z',
    '2026-08-09T11:59:00Z'
);

SELECT is(
    public.finalize_regular_war_at_transition(
        '#INCOMPLETION',
        '2026-08-09T12:00:05Z',
        NULL
    ),
    'incomplete',
    'a transition before the last complete member observation is flagged incomplete'
);

SELECT is(
    (
        SELECT finalization_status
        FROM public.regular_wars
        WHERE war_key = '#INCOMPLETE-TRANSITION'
    ),
    'incomplete',
    'incomplete evidence remains visible on the war record'
);

SELECT is(
    public.finalize_regular_war_at_transition(
        '#INCOMPLETION',
        '2026-08-09T12:01:00Z',
        NULL
    ),
    NULL,
    'a finalized war is not reclassified by a later transition'
);

SELECT * FROM finish();
ROLLBACK;
