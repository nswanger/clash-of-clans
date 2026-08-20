-- The post-CWL review surface locked in #54 records exactly one fact: whether
-- the bonus medals have been handed out. Not who received them — the API will
-- never confirm that, and ADR 0002 judged a hand-maintained record of
-- cross-season fairness not worth keeping.
--
-- That one fact does two jobs, which is why it is worth storing at all. It is
-- the review surface's only control, and it is the resting phase's explicit
-- marker: ADR 0002 originally inferred the resting phase from elapsed time
-- alone, and #54 amended it so the flag says the season is finished directly.
-- Elapsed time is a guess about when someone lost interest; the flag is an
-- observation. The elapsed-time rule survives only as the backstop for a season
-- nobody ever marks.
--
-- A COLUMN, NOT A TABLE. The fact is one nullable instant per season, and the
-- season row already exists. There is deliberately no `bonuses_administered_by`
-- to sit beside it: `audit_events` already records the actor for every act in
-- this schema, and adding a second home for the same fact is how two records of
-- one thing start to disagree.
ALTER TABLE public.cwl_seasons
    ADD COLUMN bonuses_administered_at timestamptz;

COMMENT ON COLUMN public.cwl_seasons.bonuses_administered_at IS
    'When the CWL bonus medals were handed out in game, or NULL if they have not been. Recorded by a leader, never observed from the API; doubles as the CWL route''s resting-phase marker (ADR 0002, amended by #54).';

-- Marking is a toggle rather than a one-way latch, because the control is a
-- single tap on the surface a leader reaches at the end of a season and a
-- mistap must be recoverable. The season is the unit: bonuses are administered
-- once per season, not per war day.
CREATE OR REPLACE FUNCTION public.set_cwl_bonuses_administered(
    requested_clan_tag text,
    requested_season_id text,
    administered boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    current_user_id uuid := auth.uid();
    previous_administered_at timestamptz;
    updated_season public.cwl_seasons%ROWTYPE;
BEGIN
    IF NOT public.is_leader() THEN
        RAISE EXCEPTION 'Leader access required' USING ERRCODE = '42501';
    END IF;

    SELECT season.bonuses_administered_at
    INTO previous_administered_at
    FROM public.cwl_seasons AS season
    WHERE season.clan_tag = requested_clan_tag
        AND season.season_id = requested_season_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'CWL season was not found';
    END IF;

    -- COALESCE, not now(), so marking an already-marked season is idempotent
    -- rather than moving the timestamp. The instant answers "when were they
    -- handed out", and a second tap is not a second handout.
    UPDATE public.cwl_seasons AS season
    SET bonuses_administered_at = CASE
            WHEN administered THEN COALESCE(season.bonuses_administered_at, now())
            ELSE NULL
        END,
        updated_at = now()
    WHERE season.clan_tag = requested_clan_tag
        AND season.season_id = requested_season_id
    RETURNING * INTO updated_season;

    -- Audited only when the stored value actually changes. A re-tap that lands
    -- on the value already there is not an event, and recording it would make
    -- the audit trail read as though bonuses were administered repeatedly.
    IF updated_season.bonuses_administered_at IS DISTINCT FROM previous_administered_at THEN
        INSERT INTO public.audit_events (
            actor_id,
            event_type,
            entity_type,
            entity_id,
            event_data
        )
        VALUES (
            current_user_id,
            CASE WHEN administered THEN 'cwl_bonuses_administered' ELSE 'cwl_bonuses_administration_cleared' END,
            'cwl_season',
            format('%s:%s', requested_clan_tag, requested_season_id),
            jsonb_build_object(
                'previousAdministeredAt', previous_administered_at,
                'administeredAt', updated_season.bonuses_administered_at
            )
        );
    END IF;

    RETURN jsonb_build_object(
        'clanTag', updated_season.clan_tag,
        'seasonId', updated_season.season_id,
        'bonusesAdministeredAt', updated_season.bonuses_administered_at
    );
END;
$$;

-- Writes belong to the protected function, not to a policy: `cwl_seasons` grants
-- leaders SELECT only, and every other mutation in this schema follows the same
-- shape.
REVOKE ALL ON FUNCTION public.set_cwl_bonuses_administered(text, text, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.set_cwl_bonuses_administered(text, text, boolean) TO authenticated;
