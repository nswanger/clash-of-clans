ALTER TABLE public.recommendations
ADD COLUMN input_hash char(64),
ADD COLUMN source text NOT NULL DEFAULT 'collection'
    CHECK (source IN ('collection', 'manual'));

CREATE OR REPLACE FUNCTION public.recommendation_input_hash(recommendation_input jsonb)
RETURNS char(64)
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = ''
AS $$
    SELECT encode(
        extensions.digest(
            (
                (
                    recommendation_input
                    - 'latestAvailabilityAt'
                    - 'sourceCollectionRunId'
                ) #- ARRAY['context', 'collectionHealth', 'collectedAt']
            )::text,
            'sha256'
        ),
        'hex'
    )::char(64);
$$;

CREATE OR REPLACE FUNCTION public.set_recommendation_input_hash()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF TG_OP = 'INSERT' OR new.input IS DISTINCT FROM old.input THEN
        new.input_hash := public.recommendation_input_hash(new.input);
    END IF;
    RETURN new;
END;
$$;

CREATE TRIGGER set_recommendation_input_hash_before_write
BEFORE INSERT OR UPDATE OF input ON public.recommendations
FOR EACH ROW
EXECUTE FUNCTION public.set_recommendation_input_hash();

UPDATE public.recommendations
SET input_hash = public.recommendation_input_hash(input)
WHERE input_hash IS NULL;

ALTER TABLE public.recommendations
ALTER COLUMN input_hash SET NOT NULL;

CREATE UNIQUE INDEX recommendations_input_identity_idx
ON public.recommendations (
    clan_tag,
    season_id,
    war_tag,
    strategy_version,
    input_hash
)
NULLS NOT DISTINCT;

CREATE OR REPLACE FUNCTION public.get_recommendation_context(requested_clan_tag text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    current_season public.cwl_seasons%ROWTYPE;
    current_war public.cwl_wars%ROWTYPE;
    latest_run public.collection_runs%ROWTYPE;
    member_facts jsonb;
    current_lineup jsonb;
    latest_availability_at timestamptz;
BEGIN
    IF COALESCE(auth.role(), '') != 'service_role' AND NOT public.is_leader() THEN
        RAISE EXCEPTION 'Leader access required' USING ERRCODE = '42501';
    END IF;

    SELECT
        season.id,
        season.clan_tag,
        season.season_id,
        season.war_size,
        season.target_core_size,
        season.rotation_positions,
        season.priority_mode,
        season.eight_star_rotation_enabled,
        season.created_at,
        season.updated_at
    INTO current_season
    FROM public.cwl_seasons AS season
    WHERE season.clan_tag = requested_clan_tag
    ORDER BY season.season_id DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    SELECT
        war.war_tag,
        war.clan_tag,
        war.season_id,
        war.war_day,
        war.state,
        war.preparation_start_time,
        war.start_time,
        war.end_time,
        war.opponent_tag,
        war.attacks_per_member,
        war.updated_at
    INTO current_war
    FROM public.cwl_wars AS war
    WHERE war.clan_tag = current_season.clan_tag
        AND war.season_id = current_season.season_id
        AND EXISTS (
            SELECT 1
            FROM public.cwl_war_members AS assignment
            WHERE assignment.war_tag = war.war_tag
        )
    ORDER BY war.war_day DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    SELECT
        run.id,
        run.status,
        run.started_at,
        run.finished_at,
        run.last_fresh_at,
        run.error_message
    INTO latest_run
    FROM public.collection_runs AS run
    WHERE run.status != 'running'
    ORDER BY run.started_at DESC
    LIMIT 1;

    SELECT MAX(availability.recorded_at)
    INTO latest_availability_at
    FROM public.member_availability AS availability
    WHERE availability.clan_tag = current_season.clan_tag
        AND availability.season_id = current_season.season_id;

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'playerTag', member.player_tag,
                'name', member.name,
                'townHallLevel', member.town_hall_level,
                'availability', COALESCE(availability.status::text, 'unknown'),
                'assignedOpportunities', COALESCE(reliability.assigned_opportunities, 0),
                'completedAssignedAttacks', COALESCE(reliability.completed_assigned_attacks, 0),
                'stars', COALESCE(eligibility.stars, 0),
                'eightStarEligible', COALESCE(eligibility.eight_star_eligible, false),
                'reliability', reliability.reliability
            )
            ORDER BY member.player_tag
        ),
        '[]'::jsonb
    )
    INTO member_facts
    FROM public.cwl_members AS member
    LEFT JOIN public.member_availability AS availability
        ON availability.clan_tag = member.clan_tag
        AND availability.season_id = member.season_id
        AND availability.player_tag = member.player_tag
    LEFT JOIN public.cwl_current_reliability AS reliability
        ON reliability.clan_tag = member.clan_tag
        AND reliability.season_id = member.season_id
        AND reliability.player_tag = member.player_tag
    LEFT JOIN public.cwl_eight_star_eligibility AS eligibility
        ON eligibility.clan_tag = member.clan_tag
        AND eligibility.season_id = member.season_id
        AND eligibility.player_tag = member.player_tag
    WHERE member.clan_tag = current_season.clan_tag
        AND member.season_id = current_season.season_id;

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'playerTag', assignment.player_tag,
                'position', assignment.map_position,
                'isCore', assignment.map_position <= current_season.target_core_size
            )
            ORDER BY assignment.map_position
        ),
        '[]'::jsonb
    )
    INTO current_lineup
    FROM public.cwl_war_members AS assignment
    WHERE assignment.war_tag = current_war.war_tag;

    RETURN jsonb_build_object(
        'clanTag', current_season.clan_tag,
        'seasonId', current_season.season_id,
        'warTag', current_war.war_tag,
        'input', jsonb_build_object(
            'schemaVersion', 1,
            'latestAvailabilityAt', latest_availability_at,
            'sourceCollectionRunId', latest_run.id,
            'context', jsonb_build_object(
                'seasonTag', current_season.season_id,
                'settings', jsonb_build_object(
                    'warSize', current_season.war_size,
                    'targetCoreSize', current_season.target_core_size,
                    'rotationPositions', current_season.rotation_positions,
                    'priorityMode', current_season.priority_mode,
                    'eightStarRotationEnabled', current_season.eight_star_rotation_enabled
                ),
                'members', member_facts,
                'currentLineup', current_lineup,
                'collectionHealth', jsonb_build_object(
                    'status', COALESCE(latest_run.status::text, 'error'),
                    'collectedAt', latest_run.last_fresh_at
                )
            )
        )
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.persist_recommendation(
    requested_clan_tag text,
    requested_season_id text,
    requested_war_tag text,
    requested_strategy_version text,
    requested_input jsonb,
    requested_output jsonb,
    requested_source text
)
RETURNS TABLE (recommendation_id uuid, created boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    existing_recommendation_id uuid;
    inserted_recommendation_id uuid;
    resolved_input_hash char(64);
    current_user_id uuid := auth.uid();
BEGIN
    IF COALESCE(auth.role(), '') != 'service_role' AND NOT public.is_leader() THEN
        RAISE EXCEPTION 'Leader access required' USING ERRCODE = '42501';
    END IF;
    IF requested_source NOT IN ('collection', 'manual') THEN
        RAISE EXCEPTION 'Recommendation source is invalid';
    END IF;
    IF NULLIF(btrim(requested_strategy_version), '') IS NULL THEN
        RAISE EXCEPTION 'Strategy version is required';
    END IF;
    IF requested_output ->> 'strategyVersion' IS DISTINCT FROM requested_strategy_version THEN
        RAISE EXCEPTION 'Output strategy version does not match';
    END IF;

    resolved_input_hash := public.recommendation_input_hash(requested_input);

    SELECT recommendation.id
    INTO existing_recommendation_id
    FROM public.recommendations AS recommendation
    WHERE recommendation.clan_tag = requested_clan_tag
        AND recommendation.season_id = requested_season_id
        AND recommendation.war_tag IS NOT DISTINCT FROM requested_war_tag
        AND recommendation.strategy_version = requested_strategy_version
        AND recommendation.input_hash = resolved_input_hash
    LIMIT 1;

    IF FOUND THEN
        RETURN QUERY SELECT existing_recommendation_id, false;
        RETURN;
    END IF;

    UPDATE public.recommendations AS recommendation
    SET
        status = 'superseded'::public.recommendation_status,
        superseded_at = now()
    WHERE recommendation.clan_tag = requested_clan_tag
        AND recommendation.season_id = requested_season_id
        AND recommendation.war_tag IS NOT DISTINCT FROM requested_war_tag
        AND recommendation.strategy_version = requested_strategy_version
        AND recommendation.status = 'proposed';

    INSERT INTO public.recommendations (
        clan_tag,
        season_id,
        war_tag,
        strategy_version,
        input,
        output,
        proposed_by,
        source
    )
    VALUES (
        requested_clan_tag,
        requested_season_id,
        requested_war_tag,
        requested_strategy_version,
        requested_input,
        requested_output,
        CASE WHEN COALESCE(auth.role(), '') = 'authenticated' THEN current_user_id ELSE NULL END,
        requested_source
    )
    RETURNING id INTO inserted_recommendation_id;

    RETURN QUERY SELECT inserted_recommendation_id, true;
END;
$$;

REVOKE ALL ON FUNCTION public.get_recommendation_context(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recommendation_input_hash(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.persist_recommendation(text, text, text, text, jsonb, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_recommendation_context(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.persist_recommendation(text, text, text, text, jsonb, jsonb, text)
TO authenticated, service_role;

COMMENT ON COLUMN public.recommendations.input_hash IS
    'SHA-256 of canonical JSONB input used to make retries idempotent.';
COMMENT ON COLUMN public.recommendations.source IS
    'Whether the proposal was generated by the hourly collector or an explicit leader request.';
