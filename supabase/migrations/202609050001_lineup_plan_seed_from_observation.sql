-- Seed a day's lineup plan from the observed war roster (#101).
--
-- On CWL 2026-09 day 1 the lineup workspace opened empty even though the
-- collector had already stored the day's war roster: `ensure_cwl_daily_lineup_plan`
-- created day 1 with no members and days 2-7 by inheriting the previous day, and
-- never read `cwl_war_members`. The applied baseline (`ensure_cwl_applied_lineup`)
-- already seeds from the observed roster, so the two disagreed on open and the
-- checklist read as fifteen removals. Observation is ground truth for both now.

ALTER TABLE public.cwl_daily_lineup_plans
    ADD COLUMN seed_source text NOT NULL DEFAULT 'empty'
        CHECK (seed_source IN ('empty', 'inherited', 'observed'));

UPDATE public.cwl_daily_lineup_plans
SET seed_source = 'inherited'
WHERE inherited_from_war_day IS NOT NULL;

ALTER TABLE public.cwl_daily_lineup_plans
    ADD CONSTRAINT cwl_daily_lineup_plans_seed_source_matches_inheritance
        CHECK ((seed_source = 'inherited') = (inherited_from_war_day IS NOT NULL));

COMMENT ON COLUMN public.cwl_daily_lineup_plans.seed_source IS
    'Where the plan membership came from when it was initialized, re-inherited, or filled from observation: empty, inherited (prior day), or observed (collected war roster).';

-- The observed roster in lineup order, limited to season members so the plan
-- member foreign key holds. A roster member absent from `cwl_members` is a
-- collection gap, not a reason for the trigger below to fail the collector's write.
CREATE OR REPLACE FUNCTION public.cwl_observed_lineup_members(
    requested_clan_tag text,
    requested_season_id text,
    requested_war_day smallint
)
RETURNS TABLE (player_tag text, lineup_position smallint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT
        assignment.player_tag,
        row_number() OVER (ORDER BY assignment.map_position, assignment.player_tag)::smallint AS lineup_position
    FROM public.cwl_wars AS war
    JOIN public.cwl_war_members AS assignment ON assignment.war_tag = war.war_tag
    JOIN public.cwl_members AS member
        ON member.clan_tag = war.clan_tag
        AND member.season_id = war.season_id
        AND member.player_tag = assignment.player_tag
    WHERE war.clan_tag = requested_clan_tag
        AND war.season_id = requested_season_id
        AND war.war_day = requested_war_day;
$$;

CREATE OR REPLACE FUNCTION public.cwl_daily_lineup_plan_snapshot(
    requested_plan public.cwl_daily_lineup_plans
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT jsonb_build_object(
        'clanTag', requested_plan.clan_tag,
        'seasonId', requested_plan.season_id,
        'warDay', requested_plan.war_day,
        'revision', requested_plan.revision,
        'isLocked', requested_plan.is_locked,
        'lockedAt', requested_plan.locked_at,
        'lockedBy', requested_plan.locked_by,
        'inheritedFromWarDay', requested_plan.inherited_from_war_day,
        'seedSource', requested_plan.seed_source,
        'createdAt', requested_plan.created_at,
        'createdBy', requested_plan.created_by,
        'updatedAt', requested_plan.updated_at,
        'updatedBy', requested_plan.updated_by,
        'playerTags', COALESCE(
            (
                SELECT jsonb_agg(plan_member.player_tag ORDER BY plan_member.lineup_position)
                FROM public.cwl_daily_lineup_plan_members AS plan_member
                WHERE plan_member.clan_tag = requested_plan.clan_tag
                    AND plan_member.season_id = requested_plan.season_id
                    AND plan_member.war_day = requested_plan.war_day
            ),
            '[]'::jsonb
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.ensure_cwl_daily_lineup_plan(
    requested_clan_tag text,
    requested_season_id text,
    requested_war_day smallint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    current_user_id uuid := auth.uid();
    existing_plan public.cwl_daily_lineup_plans%ROWTYPE;
    source_plan public.cwl_daily_lineup_plans%ROWTYPE;
    seed_source text;
BEGIN
    IF NOT public.is_leader() THEN
        RAISE EXCEPTION 'Leader access required' USING ERRCODE = '42501';
    END IF;
    IF requested_war_day NOT BETWEEN 1 AND 7 THEN
        RAISE EXCEPTION 'CWL war day must be between 1 and 7';
    END IF;
    IF NOT EXISTS (
        SELECT 1
        FROM public.cwl_seasons AS season
        WHERE season.clan_tag = requested_clan_tag
            AND season.season_id = requested_season_id
    ) THEN
        RAISE EXCEPTION 'CWL season was not found';
    END IF;

    SELECT plan.*
    INTO existing_plan
    FROM public.cwl_daily_lineup_plans AS plan
    WHERE plan.clan_tag = requested_clan_tag
        AND plan.season_id = requested_season_id
        AND plan.war_day = requested_war_day;

    IF FOUND THEN
        RETURN public.cwl_daily_lineup_plan_snapshot(existing_plan);
    END IF;

    -- The prior day is still opened first so the season's plan chain is complete
    -- for re-inheritance, whichever source seeds this one.
    IF requested_war_day > 1 THEN
        PERFORM public.ensure_cwl_daily_lineup_plan(
            requested_clan_tag,
            requested_season_id,
            (requested_war_day - 1)::smallint
        );

        SELECT source.*
        INTO source_plan
        FROM public.cwl_daily_lineup_plans AS source
        WHERE source.clan_tag = requested_clan_tag
            AND source.season_id = requested_season_id
            AND source.war_day = requested_war_day - 1
        FOR SHARE;
    END IF;

    -- Same rule as the applied baseline: a day whose war roster has been
    -- collected starts from it, so the plan and the baseline agree on open.
    IF EXISTS (
        SELECT 1
        FROM public.cwl_observed_lineup_members(requested_clan_tag, requested_season_id, requested_war_day)
    ) THEN
        seed_source := 'observed';
    ELSIF requested_war_day > 1 THEN
        seed_source := 'inherited';
    ELSE
        seed_source := 'empty';
    END IF;

    INSERT INTO public.cwl_daily_lineup_plans (
        clan_tag,
        season_id,
        war_day,
        inherited_from_war_day,
        seed_source,
        created_by,
        updated_by
    )
    VALUES (
        requested_clan_tag,
        requested_season_id,
        requested_war_day,
        CASE WHEN seed_source = 'inherited' THEN requested_war_day - 1 END,
        seed_source,
        current_user_id,
        current_user_id
    )
    ON CONFLICT (clan_tag, season_id, war_day) DO NOTHING
    RETURNING * INTO existing_plan;

    IF NOT FOUND THEN
        SELECT plan.*
        INTO existing_plan
        FROM public.cwl_daily_lineup_plans AS plan
        WHERE plan.clan_tag = requested_clan_tag
            AND plan.season_id = requested_season_id
            AND plan.war_day = requested_war_day;
        RETURN public.cwl_daily_lineup_plan_snapshot(existing_plan);
    END IF;

    IF seed_source = 'observed' THEN
        INSERT INTO public.cwl_daily_lineup_plan_members (
            clan_tag,
            season_id,
            war_day,
            player_tag,
            lineup_position
        )
        SELECT
            requested_clan_tag,
            requested_season_id,
            requested_war_day,
            observed.player_tag,
            observed.lineup_position
        FROM public.cwl_observed_lineup_members(requested_clan_tag, requested_season_id, requested_war_day) AS observed;
    ELSIF seed_source = 'inherited' THEN
        INSERT INTO public.cwl_daily_lineup_plan_members (
            clan_tag,
            season_id,
            war_day,
            player_tag,
            lineup_position
        )
        SELECT
            source_member.clan_tag,
            source_member.season_id,
            requested_war_day,
            source_member.player_tag,
            source_member.lineup_position
        FROM public.cwl_daily_lineup_plan_members AS source_member
        WHERE source_member.clan_tag = source_plan.clan_tag
            AND source_member.season_id = source_plan.season_id
            AND source_member.war_day = source_plan.war_day;
    END IF;

    INSERT INTO public.audit_events (
        actor_id,
        event_type,
        entity_type,
        entity_id,
        event_data
    )
    VALUES (
        current_user_id,
        'lineup_plan_initialized',
        'cwl_daily_lineup_plan',
        format('%s:%s:%s', requested_clan_tag, requested_season_id, requested_war_day),
        jsonb_build_object(
            'clanTag', requested_clan_tag,
            'seasonId', requested_season_id,
            'warDay', requested_war_day,
            'revision', existing_plan.revision,
            'inheritedFromWarDay', existing_plan.inherited_from_war_day,
            'seedSource', seed_source,
            'memberCount', (
                SELECT count(*)
                FROM public.cwl_daily_lineup_plan_members AS plan_member
                WHERE plan_member.clan_tag = requested_clan_tag
                    AND plan_member.season_id = requested_season_id
                    AND plan_member.war_day = requested_war_day
            )
        )
    );

    RETURN public.cwl_daily_lineup_plan_snapshot(existing_plan);
END;
$$;

CREATE OR REPLACE FUNCTION public.reinherit_cwl_daily_lineup_plan(
    requested_clan_tag text,
    requested_season_id text,
    requested_war_day smallint,
    expected_revision integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    current_user_id uuid := auth.uid();
    source_plan public.cwl_daily_lineup_plans%ROWTYPE;
    current_plan public.cwl_daily_lineup_plans%ROWTYPE;
BEGIN
    IF NOT public.is_leader() THEN
        RAISE EXCEPTION 'Leader access required' USING ERRCODE = '42501';
    END IF;
    IF requested_war_day <= 1 OR requested_war_day > 7 THEN
        RAISE EXCEPTION 'Only days 2 through 7 can re-inherit a prior plan';
    END IF;

    PERFORM public.ensure_cwl_daily_lineup_plan(
        requested_clan_tag,
        requested_season_id,
        (requested_war_day - 1)::smallint
    );
    PERFORM public.ensure_cwl_daily_lineup_plan(
        requested_clan_tag,
        requested_season_id,
        requested_war_day
    );

    SELECT source.*
    INTO source_plan
    FROM public.cwl_daily_lineup_plans AS source
    WHERE source.clan_tag = requested_clan_tag
        AND source.season_id = requested_season_id
        AND source.war_day = requested_war_day - 1
    FOR SHARE;

    SELECT plan.*
    INTO current_plan
    FROM public.cwl_daily_lineup_plans AS plan
    WHERE plan.clan_tag = requested_clan_tag
        AND plan.season_id = requested_season_id
        AND plan.war_day = requested_war_day
    FOR UPDATE;
    IF current_plan.revision != expected_revision THEN
        RAISE EXCEPTION 'CWL lineup is stale; reload latest' USING ERRCODE = '40001';
    END IF;
    IF current_plan.is_locked THEN
        RAISE EXCEPTION 'CWL lineup is locked';
    END IF;

    DELETE FROM public.cwl_daily_lineup_plan_members AS plan_member
    WHERE plan_member.clan_tag = requested_clan_tag
        AND plan_member.season_id = requested_season_id
        AND plan_member.war_day = requested_war_day;

    INSERT INTO public.cwl_daily_lineup_plan_members (
        clan_tag,
        season_id,
        war_day,
        player_tag,
        lineup_position
    )
    SELECT
        source_member.clan_tag,
        source_member.season_id,
        requested_war_day,
        source_member.player_tag,
        source_member.lineup_position
    FROM public.cwl_daily_lineup_plan_members AS source_member
    WHERE source_member.clan_tag = source_plan.clan_tag
        AND source_member.season_id = source_plan.season_id
        AND source_member.war_day = source_plan.war_day;

    UPDATE public.cwl_daily_lineup_plans AS plan
    SET
        revision = plan.revision + 1,
        inherited_from_war_day = requested_war_day - 1,
        seed_source = 'inherited',
        updated_at = now(),
        updated_by = current_user_id
    WHERE plan.clan_tag = requested_clan_tag
        AND plan.season_id = requested_season_id
        AND plan.war_day = requested_war_day
    RETURNING plan.* INTO current_plan;

    INSERT INTO public.audit_events (
        actor_id,
        event_type,
        entity_type,
        entity_id,
        event_data
    )
    VALUES (
        current_user_id,
        'lineup_plan_reinherited',
        'cwl_daily_lineup_plan',
        format('%s:%s:%s', requested_clan_tag, requested_season_id, requested_war_day),
        jsonb_build_object(
            'revision', current_plan.revision,
            'sourceWarDay', requested_war_day - 1,
            'memberCount', (
                SELECT count(*)
                FROM public.cwl_daily_lineup_plan_members AS plan_member
                WHERE plan_member.clan_tag = requested_clan_tag
                    AND plan_member.season_id = requested_season_id
                    AND plan_member.war_day = requested_war_day
            )
        )
    );

    RETURN public.cwl_daily_lineup_plan_snapshot(current_plan);
END;
$$;

-- A leader who opened a day before its war was collected holds an empty plan
-- nobody has touched. When the observation arrives it fills that plan, exactly
-- as opening the day afterwards would have. Anything a leader has already acted
-- on (a save, a lock, a re-inheritance all advance the revision) is theirs and
-- is left alone; the applied baseline carries the observation for those days.
CREATE OR REPLACE FUNCTION public.sync_cwl_daily_lineup_plan_from_observation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    observed_war record;
    current_plan public.cwl_daily_lineup_plans%ROWTYPE;
    inserted_count integer;
BEGIN
    FOR observed_war IN
        SELECT DISTINCT war.clan_tag, war.season_id, war.war_day
        FROM (SELECT DISTINCT observed_member.war_tag FROM observed_members AS observed_member) AS touched
        JOIN public.cwl_wars AS war ON war.war_tag = touched.war_tag
        WHERE war.war_day BETWEEN 1 AND 7
    LOOP
        SELECT plan.*
        INTO current_plan
        FROM public.cwl_daily_lineup_plans AS plan
        WHERE plan.clan_tag = observed_war.clan_tag
            AND plan.season_id = observed_war.season_id
            AND plan.war_day = observed_war.war_day
        FOR UPDATE;
        CONTINUE WHEN NOT FOUND;
        CONTINUE WHEN current_plan.revision <> 1 OR current_plan.is_locked;
        CONTINUE WHEN EXISTS (
            SELECT 1
            FROM public.cwl_daily_lineup_plan_members AS plan_member
            WHERE plan_member.clan_tag = observed_war.clan_tag
                AND plan_member.season_id = observed_war.season_id
                AND plan_member.war_day = observed_war.war_day
        );

        INSERT INTO public.cwl_daily_lineup_plan_members (
            clan_tag,
            season_id,
            war_day,
            player_tag,
            lineup_position
        )
        SELECT
            observed_war.clan_tag,
            observed_war.season_id,
            observed_war.war_day,
            observed.player_tag,
            observed.lineup_position
        FROM public.cwl_observed_lineup_members(
            observed_war.clan_tag,
            observed_war.season_id,
            observed_war.war_day::smallint
        ) AS observed;
        GET DIAGNOSTICS inserted_count = ROW_COUNT;
        CONTINUE WHEN inserted_count = 0;

        UPDATE public.cwl_daily_lineup_plans AS plan
        SET
            revision = plan.revision + 1,
            inherited_from_war_day = NULL,
            seed_source = 'observed',
            updated_at = now(),
            updated_by = NULL
        WHERE plan.clan_tag = observed_war.clan_tag
            AND plan.season_id = observed_war.season_id
            AND plan.war_day = observed_war.war_day
        RETURNING plan.* INTO current_plan;

        INSERT INTO public.audit_events (
            actor_id,
            event_type,
            entity_type,
            entity_id,
            event_data
        )
        VALUES (
            NULL,
            'lineup_plan_observed',
            'cwl_daily_lineup_plan',
            format('%s:%s:%s', observed_war.clan_tag, observed_war.season_id, observed_war.war_day),
            jsonb_build_object(
                'clanTag', observed_war.clan_tag,
                'seasonId', observed_war.season_id,
                'warDay', observed_war.war_day,
                'revision', current_plan.revision,
                'seedSource', 'observed',
                'memberCount', inserted_count
            )
        );
    END LOOP;

    RETURN NULL;
END;
$$;

-- Two triggers for the same reason as the applied-lineup sync: a transition
-- table attaches to a single-event trigger only.
CREATE TRIGGER cwl_war_members_insert_sync_lineup_plan
    AFTER INSERT ON public.cwl_war_members
    REFERENCING NEW TABLE AS observed_members
    FOR EACH STATEMENT
    EXECUTE FUNCTION public.sync_cwl_daily_lineup_plan_from_observation();

CREATE TRIGGER cwl_war_members_update_sync_lineup_plan
    AFTER UPDATE ON public.cwl_war_members
    REFERENCING NEW TABLE AS observed_members
    FOR EACH STATEMENT
    EXECUTE FUNCTION public.sync_cwl_daily_lineup_plan_from_observation();

REVOKE ALL ON FUNCTION public.cwl_observed_lineup_members(text, text, smallint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_cwl_daily_lineup_plan_from_observation() FROM PUBLIC;

COMMENT ON FUNCTION public.ensure_cwl_daily_lineup_plan(text, text, smallint) IS
    'Returns the daily plan, creating it on first open: from the collected war roster when the day has been observed, otherwise from the prior day, otherwise empty.';
COMMENT ON FUNCTION public.sync_cwl_daily_lineup_plan_from_observation() IS
    'Fills a still-untouched empty daily plan from the war roster when collection records it, so a day opened before its war was collected does not stay empty.';
