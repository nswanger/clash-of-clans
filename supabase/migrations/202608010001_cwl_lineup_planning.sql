CREATE TABLE public.cwl_daily_lineup_plans (
    clan_tag text NOT NULL,
    season_id text NOT NULL,
    war_day smallint NOT NULL CHECK (war_day BETWEEN 1 AND 7),
    revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
    is_locked boolean NOT NULL DEFAULT false,
    locked_at timestamptz,
    locked_by uuid REFERENCES public.profiles(id),
    inherited_from_war_day smallint,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    PRIMARY KEY (clan_tag, season_id, war_day),
    FOREIGN KEY (clan_tag, season_id)
        REFERENCES public.cwl_seasons(clan_tag, season_id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,
    CHECK ((is_locked = false AND locked_at IS NULL AND locked_by IS NULL)
        OR (is_locked = true AND locked_at IS NOT NULL AND locked_by IS NOT NULL)),
    CHECK (inherited_from_war_day IS NULL OR inherited_from_war_day = war_day - 1)
);

CREATE TABLE public.cwl_daily_lineup_plan_members (
    clan_tag text NOT NULL,
    season_id text NOT NULL,
    war_day smallint NOT NULL,
    player_tag text NOT NULL CHECK (btrim(player_tag) <> ''),
    lineup_position smallint NOT NULL CHECK (lineup_position > 0),
    PRIMARY KEY (clan_tag, season_id, war_day, player_tag),
    UNIQUE (clan_tag, season_id, war_day, lineup_position),
    FOREIGN KEY (clan_tag, season_id, war_day)
        REFERENCES public.cwl_daily_lineup_plans(clan_tag, season_id, war_day)
        ON UPDATE RESTRICT
        ON DELETE CASCADE,
    FOREIGN KEY (clan_tag, season_id, player_tag)
        REFERENCES public.cwl_members(clan_tag, season_id, player_tag)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT
);

CREATE INDEX cwl_daily_lineup_plan_members_order_idx
    ON public.cwl_daily_lineup_plan_members (clan_tag, season_id, war_day, lineup_position);

CREATE INDEX audit_events_cwl_lineup_plan_idx
    ON public.audit_events (entity_type, entity_id, occurred_at DESC)
    WHERE entity_type = 'cwl_daily_lineup_plan';

ALTER TABLE public.cwl_daily_lineup_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cwl_daily_lineup_plan_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Leaders read daily lineup plans"
    ON public.cwl_daily_lineup_plans FOR SELECT TO authenticated
    USING (public.is_leader());

CREATE POLICY "Leaders read daily lineup plan members"
    ON public.cwl_daily_lineup_plan_members FOR SELECT TO authenticated
    USING (public.is_leader());

GRANT SELECT ON public.cwl_daily_lineup_plans, public.cwl_daily_lineup_plan_members TO authenticated;

COMMENT ON TABLE public.cwl_daily_lineup_plans IS
    'Current editable planned lineup state for one CWL season war day; observed API assignments remain separate.';
COMMENT ON COLUMN public.cwl_daily_lineup_plans.revision IS
    'Optimistic concurrency token. Every successful save, lock, unlock, or re-inheritance advances it.';
COMMENT ON COLUMN public.cwl_daily_lineup_plans.inherited_from_war_day IS
    'The prior day used when this snapshot was initialized or explicitly re-inherited; later edits do not cascade.';

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

    INSERT INTO public.cwl_daily_lineup_plans (
        clan_tag,
        season_id,
        war_day,
        inherited_from_war_day,
        created_by,
        updated_by
    )
    VALUES (
        requested_clan_tag,
        requested_season_id,
        requested_war_day,
        CASE WHEN requested_war_day > 1 THEN requested_war_day - 1 END,
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

    IF requested_war_day > 1 THEN
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
        RAISE EXCEPTION 'CWL lineup is stale; reload latest' USING ERRCODE = '40001';
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
        RAISE EXCEPTION 'CWL lineup is stale; reload latest' USING ERRCODE = '40001';
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

REVOKE ALL ON FUNCTION public.cwl_daily_lineup_plan_snapshot(public.cwl_daily_lineup_plans) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_cwl_daily_lineup_plan(text, text, smallint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_cwl_daily_lineup_plan(text, text, smallint, integer, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_cwl_daily_lineup_plan_lock(text, text, smallint, integer, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reinherit_cwl_daily_lineup_plan(text, text, smallint, integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.ensure_cwl_daily_lineup_plan(text, text, smallint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_cwl_daily_lineup_plan(text, text, smallint, integer, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_cwl_daily_lineup_plan_lock(text, text, smallint, integer, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reinherit_cwl_daily_lineup_plan(text, text, smallint, integer) TO authenticated;

COMMENT ON FUNCTION public.ensure_cwl_daily_lineup_plan(text, text, smallint) IS
    'Creates a current daily plan once, copying the prior day snapshot without future cascading.';
COMMENT ON FUNCTION public.save_cwl_daily_lineup_plan(text, text, smallint, integer, jsonb) IS
    'Replaces an unlocked daily plan only when the caller supplies its current revision.';
COMMENT ON FUNCTION public.set_cwl_daily_lineup_plan_lock(text, text, smallint, integer, boolean) IS
    'Advances the daily plan revision when a leader locks or unlocks it.';
COMMENT ON FUNCTION public.reinherit_cwl_daily_lineup_plan(text, text, smallint, integer) IS
    'Explicitly replaces a daily plan with the prior day snapshot after optimistic concurrency checks.';

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
                'clanRole', CASE roster.role
                    WHEN 'admin' THEN 'elder'
                    WHEN 'leader' THEN 'leader'
                    WHEN 'coLeader' THEN 'coLeader'
                    WHEN 'member' THEN 'member'
                    ELSE 'unknown'
                END,
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
    LEFT JOIN public.member_roster_overview AS roster
        ON roster.clan_tag = member.clan_tag
        AND roster.player_tag = member.player_tag
        AND roster.is_current_member
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
                    'collectedAt', latest_run.last_fresh_at,
                    'message', latest_run.error_message
                )
            )
        )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_recommendation_context(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_recommendation_context(text) TO authenticated, service_role;
