-- SQLSTATE 40001 (serialization_failure) tells PostgREST the failure is
-- transient, so it retries the transaction indefinitely. One stale save on
-- 2026-11-06 looped ~1,300 times a second for over a day and pinned the
-- database CPU. PT409 keeps the same message (the client matches on "stale")
-- and maps to HTTP 409 without a retry.
-- https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b

CREATE OR REPLACE FUNCTION public.save_cwl_daily_lineup_plan(
    requested_clan_tag text,
    requested_season_id text,
    requested_war_day smallint,
    expected_revision integer,
    requested_player_tags jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    current_user_id uuid := auth.uid();
    current_plan public.cwl_daily_lineup_plans%ROWTYPE;
    current_season public.cwl_seasons%ROWTYPE;
    previous_player_tags jsonb;
    requested_count integer;
    distinct_count integer;
BEGIN
    IF NOT public.is_leader() THEN
        RAISE EXCEPTION 'Leader access required' USING ERRCODE = '42501';
    END IF;
    IF requested_player_tags IS NULL OR jsonb_typeof(requested_player_tags) != 'array' THEN
        RAISE EXCEPTION 'Lineup members must be a JSON array';
    END IF;

    SELECT season.*
    INTO current_season
    FROM public.cwl_seasons AS season
    WHERE season.clan_tag = requested_clan_tag
        AND season.season_id = requested_season_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'CWL season was not found';
    END IF;
    IF jsonb_array_length(requested_player_tags) > current_season.war_size THEN
        RAISE EXCEPTION 'Lineup cannot exceed the season war size';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(requested_player_tags) AS requested(value)
        WHERE jsonb_typeof(requested.value) != 'string'
            OR btrim(requested.value #>> '{}') = ''
    ) THEN
        RAISE EXCEPTION 'Lineup members must be non-empty player tags';
    END IF;

    SELECT
        count(*)::integer,
        count(DISTINCT requested.player_tag)::integer
    INTO requested_count, distinct_count
    FROM jsonb_array_elements_text(requested_player_tags) AS requested(player_tag);
    IF requested_count != distinct_count THEN
        RAISE EXCEPTION 'A lineup cannot contain the same member twice';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(requested_player_tags) AS requested(player_tag)
        LEFT JOIN public.cwl_members AS member
            ON member.clan_tag = requested_clan_tag
            AND member.season_id = requested_season_id
            AND member.player_tag = requested.player_tag
        WHERE member.player_tag IS NULL
    ) THEN
        RAISE EXCEPTION 'Lineup contains a member outside the season roster';
    END IF;

    SELECT plan.*
    INTO current_plan
    FROM public.cwl_daily_lineup_plans AS plan
    WHERE plan.clan_tag = requested_clan_tag
        AND plan.season_id = requested_season_id
        AND plan.war_day = requested_war_day
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Lineup day is not initialized';
    END IF;
    IF current_plan.revision != expected_revision THEN
        RAISE EXCEPTION 'CWL lineup is stale; reload latest' USING ERRCODE = 'PT409';
    END IF;
    IF current_plan.is_locked THEN
        RAISE EXCEPTION 'CWL lineup is locked';
    END IF;

    SELECT COALESCE(
        jsonb_agg(plan_member.player_tag ORDER BY plan_member.lineup_position),
        '[]'::jsonb
    )
    INTO previous_player_tags
    FROM public.cwl_daily_lineup_plan_members AS plan_member
    WHERE plan_member.clan_tag = requested_clan_tag
        AND plan_member.season_id = requested_season_id
        AND plan_member.war_day = requested_war_day;

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
        requested_clan_tag,
        requested_season_id,
        requested_war_day,
        requested.player_tag,
        requested.lineup_position::smallint
    FROM jsonb_array_elements_text(requested_player_tags) WITH ORDINALITY AS requested(player_tag, lineup_position);

    UPDATE public.cwl_daily_lineup_plans AS plan
    SET
        revision = plan.revision + 1,
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
        'lineup_plan_saved',
        'cwl_daily_lineup_plan',
        format('%s:%s:%s', requested_clan_tag, requested_season_id, requested_war_day),
        jsonb_build_object(
            'revision', current_plan.revision,
            'memberCount', requested_count,
            'previousPlayerTags', previous_player_tags,
            'playerTags', requested_player_tags
        )
    );

    RETURN public.cwl_daily_lineup_plan_snapshot(current_plan);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_cwl_daily_lineup_plan_lock(
    requested_clan_tag text,
    requested_season_id text,
    requested_war_day smallint,
    expected_revision integer,
    requested_is_locked boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    current_user_id uuid := auth.uid();
    current_plan public.cwl_daily_lineup_plans%ROWTYPE;
BEGIN
    IF NOT public.is_leader() THEN
        RAISE EXCEPTION 'Leader access required' USING ERRCODE = '42501';
    END IF;

    SELECT plan.*
    INTO current_plan
    FROM public.cwl_daily_lineup_plans AS plan
    WHERE plan.clan_tag = requested_clan_tag
        AND plan.season_id = requested_season_id
        AND plan.war_day = requested_war_day
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Lineup day is not initialized';
    END IF;
    IF current_plan.revision != expected_revision THEN
        RAISE EXCEPTION 'CWL lineup is stale; reload latest' USING ERRCODE = 'PT409';
    END IF;
    IF current_plan.is_locked = requested_is_locked THEN
        RETURN public.cwl_daily_lineup_plan_snapshot(current_plan);
    END IF;

    UPDATE public.cwl_daily_lineup_plans AS plan
    SET
        revision = plan.revision + 1,
        is_locked = requested_is_locked,
        locked_at = CASE WHEN requested_is_locked THEN now() END,
        locked_by = CASE WHEN requested_is_locked THEN current_user_id END,
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
        CASE WHEN requested_is_locked THEN 'lineup_plan_locked' ELSE 'lineup_plan_unlocked' END,
        'cwl_daily_lineup_plan',
        format('%s:%s:%s', requested_clan_tag, requested_season_id, requested_war_day),
        jsonb_build_object('revision', current_plan.revision)
    );

    RETURN public.cwl_daily_lineup_plan_snapshot(current_plan);
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
        RAISE EXCEPTION 'CWL lineup is stale; reload latest' USING ERRCODE = 'PT409';
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
