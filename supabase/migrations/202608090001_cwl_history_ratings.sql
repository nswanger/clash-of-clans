-- Regular-war observations are separate from CWL facts. The official API only
-- exposes member-level regular-war evidence while a war is current, so these
-- facts are explicitly observed-history rather than a claim about every war.
CREATE TABLE public.regular_wars (
    war_key text PRIMARY KEY CHECK (btrim(war_key) <> ''),
    clan_tag text NOT NULL CHECK (btrim(clan_tag) <> ''),
    state text NOT NULL CHECK (btrim(state) <> ''),
    preparation_start_time timestamptz,
    start_time timestamptz,
    end_time timestamptz,
    team_size smallint CHECK (team_size > 0),
    attacks_per_member smallint NOT NULL DEFAULT 1 CHECK (attacks_per_member > 0),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.regular_war_members (
    war_key text NOT NULL REFERENCES public.regular_wars(war_key) ON UPDATE RESTRICT ON DELETE CASCADE,
    player_tag text NOT NULL CHECK (btrim(player_tag) <> ''),
    name text NOT NULL CHECK (btrim(name) <> ''),
    town_hall_level smallint CHECK (town_hall_level > 0),
    assigned_attacks smallint NOT NULL DEFAULT 1 CHECK (assigned_attacks >= 0),
    attacks_made smallint NOT NULL DEFAULT 0 CHECK (attacks_made >= 0),
    stars smallint NOT NULL DEFAULT 0 CHECK (stars >= 0),
    PRIMARY KEY (war_key, player_tag),
    CHECK (attacks_made <= assigned_attacks)
);

CREATE INDEX regular_wars_clan_end_idx ON public.regular_wars (clan_tag, end_time DESC);
CREATE INDEX regular_war_members_player_idx ON public.regular_war_members (player_tag, war_key);

ALTER TABLE public.regular_wars ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.regular_war_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Leaders read regular wars"
    ON public.regular_wars FOR SELECT TO authenticated USING (public.is_leader());
CREATE POLICY "Leaders read regular war members"
    ON public.regular_war_members FOR SELECT TO authenticated USING (public.is_leader());

GRANT SELECT ON public.regular_wars, public.regular_war_members TO authenticated;

CREATE OR REPLACE FUNCTION public.apply_regular_war_unit(
    p_war jsonb,
    p_members jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_war_key text := p_war ->> 'war_key';
BEGIN
    IF v_war_key IS NULL OR btrim(v_war_key) = '' THEN
        RAISE EXCEPTION 'war_key is required';
    END IF;

    INSERT INTO public.regular_wars (
        war_key, clan_tag, state, preparation_start_time, start_time, end_time,
        team_size, attacks_per_member, updated_at
    ) VALUES (
        v_war_key, p_war ->> 'clan_tag', p_war ->> 'state',
        (p_war ->> 'preparation_start_time')::timestamptz,
        (p_war ->> 'start_time')::timestamptz,
        (p_war ->> 'end_time')::timestamptz,
        (p_war ->> 'team_size')::smallint,
        coalesce((p_war ->> 'attacks_per_member')::smallint, 1),
        now()
    )
    ON CONFLICT (war_key) DO UPDATE SET
        clan_tag = excluded.clan_tag,
        state = excluded.state,
        preparation_start_time = excluded.preparation_start_time,
        start_time = excluded.start_time,
        end_time = excluded.end_time,
        team_size = excluded.team_size,
        attacks_per_member = excluded.attacks_per_member,
        updated_at = excluded.updated_at;

    DELETE FROM public.regular_war_members WHERE war_key = v_war_key;
    INSERT INTO public.regular_war_members (
        war_key, player_tag, name, town_hall_level, assigned_attacks, attacks_made, stars
    )
    SELECT war_key, player_tag, name, town_hall_level, assigned_attacks, attacks_made, stars
    FROM jsonb_to_recordset(coalesce(p_members, '[]'::jsonb)) AS member(
        war_key text,
        player_tag text,
        name text,
        town_hall_level smallint,
        assigned_attacks smallint,
        attacks_made smallint,
        stars smallint
    );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_regular_war_unit(jsonb, jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_regular_war_unit(jsonb, jsonb) TO service_role;

CREATE OR REPLACE VIEW public.regular_war_member_history
WITH (security_invoker = true) AS
SELECT
    war.clan_tag,
    member.player_tag,
    count(DISTINCT war.war_key)::integer AS wars_participated,
    coalesce(sum(member.assigned_attacks), 0)::integer AS assigned_attacks,
    coalesce(sum(member.attacks_made), 0)::integer AS attacks_made,
    coalesce(sum(member.stars), 0)::integer AS stars
FROM public.regular_wars AS war
JOIN public.regular_war_members AS member ON member.war_key = war.war_key
WHERE war.state <> 'preparation'
  AND (war.state = 'warEnded' OR (war.end_time IS NOT NULL AND war.end_time <= now()))
GROUP BY war.clan_tag, member.player_tag;

CREATE OR REPLACE VIEW public.regular_war_clan_history
WITH (security_invoker = true) AS
SELECT clan_tag, count(*)::integer AS wars_observed
FROM public.regular_wars
WHERE state <> 'preparation'
  AND (state = 'warEnded' OR (end_time IS NOT NULL AND end_time <= now()))
GROUP BY clan_tag;

CREATE OR REPLACE VIEW public.cwl_member_bonus_progress
WITH (security_invoker = true) AS
SELECT
    assignment.clan_tag,
    assignment.season_id,
    assignment.player_tag,
    count(DISTINCT assignment.war_tag)::integer AS wars_participated,
    coalesce(sum(attack.stars), 0)::integer AS stars,
    CASE
        WHEN count(DISTINCT assignment.war_tag) = 0 THEN NULL
        ELSE least(
            100::numeric,
            (coalesce(sum(attack.stars), 0)::numeric
                / (8 * count(DISTINCT assignment.war_tag))) * 100
        )
    END AS bonus_priority_score
FROM public.cwl_current_season_assignments AS assignment
LEFT JOIN public.cwl_attacks AS attack
    ON attack.war_tag = assignment.war_tag
   AND attack.attacker_tag = assignment.player_tag
WHERE assignment.war_state IN ('inWar', 'warEnded')
GROUP BY assignment.clan_tag, assignment.season_id, assignment.player_tag;

GRANT SELECT ON public.regular_war_member_history, public.regular_war_clan_history,
    public.cwl_member_bonus_progress TO authenticated;

CREATE OR REPLACE VIEW public.cwl_member_overall_rating
WITH (security_invoker = true) AS
SELECT
    member.clan_tag,
    member.season_id,
    member.player_tag,
    coalesce(regular_clan.wars_observed, 0)::integer AS regular_wars_observed,
    coalesce(regular_history.wars_participated, 0)::integer AS regular_wars_participated,
    coalesce(regular_history.assigned_attacks, 0)::integer AS regular_assigned_attacks,
    coalesce(regular_history.attacks_made, 0)::integer AS regular_attacks_made,
    CASE WHEN coalesce(regular_clan.wars_observed, 0) = 0 THEN NULL ELSE regular_history.wars_participated::numeric / regular_clan.wars_observed END AS regular_participation_rate,
    CASE WHEN coalesce(regular_history.assigned_attacks, 0) = 0 THEN NULL ELSE regular_history.attacks_made::numeric / regular_history.assigned_attacks END AS regular_attack_completion_rate,
    CASE
        WHEN reliability.reliability IS NOT NULL AND regular_history.assigned_attacks > 0 THEN round((100 * (0.6 * reliability.reliability + 0.4 * ((regular_history.wars_participated::numeric / NULLIF(regular_clan.wars_observed, 0) + regular_history.attacks_made::numeric / regular_history.assigned_attacks) / 2)))::numeric)
        WHEN reliability.reliability IS NOT NULL THEN round(100 * reliability.reliability)::numeric
        WHEN regular_history.assigned_attacks > 0 THEN round(100 * ((regular_history.wars_participated::numeric / NULLIF(regular_clan.wars_observed, 0) + regular_history.attacks_made::numeric / regular_history.assigned_attacks) / 2))
        ELSE NULL
    END AS overall_rating,
    coalesce(bonus.wars_participated, 0)::integer AS cwl_wars_participated,
    coalesce(bonus.stars, 0)::integer AS cwl_stars,
    CASE WHEN coalesce(bonus.stars, 0) >= 8 THEN NULL ELSE bonus.bonus_priority_score END AS bonus_priority_score
FROM public.cwl_members AS member
LEFT JOIN public.cwl_current_reliability AS reliability ON reliability.clan_tag = member.clan_tag AND reliability.season_id = member.season_id AND reliability.player_tag = member.player_tag
LEFT JOIN public.regular_war_member_history AS regular_history ON regular_history.clan_tag = member.clan_tag AND regular_history.player_tag = member.player_tag
LEFT JOIN public.regular_war_clan_history AS regular_clan ON regular_clan.clan_tag = member.clan_tag
LEFT JOIN public.cwl_member_bonus_progress AS bonus ON bonus.clan_tag = member.clan_tag AND bonus.season_id = member.season_id AND bonus.player_tag = member.player_tag;

GRANT SELECT ON public.cwl_member_overall_rating TO authenticated;

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

    SELECT season.* INTO current_season
    FROM public.cwl_seasons AS season
    WHERE season.clan_tag = requested_clan_tag
    ORDER BY season.season_id DESC LIMIT 1;
    IF NOT FOUND THEN RETURN NULL; END IF;

    SELECT war.* INTO current_war
    FROM public.cwl_wars AS war
    WHERE war.clan_tag = current_season.clan_tag
      AND war.season_id = current_season.season_id
      AND EXISTS (SELECT 1 FROM public.cwl_war_members AS assignment WHERE assignment.war_tag = war.war_tag)
    ORDER BY war.war_day DESC LIMIT 1;
    IF NOT FOUND THEN RETURN NULL; END IF;

    SELECT run.* INTO latest_run
    FROM public.collection_runs AS run
    WHERE run.status != 'running'
    ORDER BY run.started_at DESC LIMIT 1;

    SELECT MAX(availability.recorded_at) INTO latest_availability_at
    FROM public.member_availability AS availability
    WHERE availability.clan_tag = current_season.clan_tag
      AND availability.season_id = current_season.season_id;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'playerTag', member.player_tag,
        'name', member.name,
        'townHallLevel', member.town_hall_level,
        'clanRole', CASE roster.role
            WHEN 'admin' THEN 'elder' WHEN 'leader' THEN 'leader'
            WHEN 'coLeader' THEN 'coLeader' WHEN 'member' THEN 'member'
            ELSE 'unknown' END,
        'availability', COALESCE(availability.status::text, 'unknown'),
        'assignedOpportunities', COALESCE(reliability.assigned_opportunities, 0),
        'completedAssignedAttacks', COALESCE(reliability.completed_assigned_attacks, 0),
        'stars', COALESCE(eligibility.stars, 0),
        'eightStarEligible', COALESCE(eligibility.eight_star_eligible, false),
        'reliability', reliability.reliability,
        'regularWarsObserved', COALESCE(regular_clan.wars_observed, 0),
        'regularWarsParticipated', COALESCE(regular_history.wars_participated, 0),
        'regularAssignedAttacks', COALESCE(regular_history.assigned_attacks, 0),
        'regularAttacksMade', COALESCE(regular_history.attacks_made, 0),
        'regularParticipationRate', CASE WHEN COALESCE(regular_clan.wars_observed, 0) = 0 THEN NULL ELSE regular_history.wars_participated::numeric / regular_clan.wars_observed END,
        'regularAttackCompletionRate', CASE WHEN COALESCE(regular_history.assigned_attacks, 0) = 0 THEN NULL ELSE regular_history.attacks_made::numeric / regular_history.assigned_attacks END,
        'overallRating', CASE
            WHEN reliability.reliability IS NOT NULL AND regular_history.assigned_attacks > 0 THEN round(100 * (0.6 * reliability.reliability + 0.4 * ((regular_history.wars_participated::numeric / NULLIF(regular_clan.wars_observed, 0) + regular_history.attacks_made::numeric / regular_history.assigned_attacks) / 2)))
            WHEN reliability.reliability IS NOT NULL THEN round(100 * reliability.reliability)
            WHEN regular_history.assigned_attacks > 0 THEN round(100 * ((regular_history.wars_participated::numeric / NULLIF(regular_clan.wars_observed, 0) + regular_history.attacks_made::numeric / regular_history.assigned_attacks) / 2))
            ELSE NULL END,
        'bonusPriorityScore', CASE WHEN COALESCE(eligibility.stars, 0) >= 8 THEN NULL ELSE bonus.bonus_priority_score END
    ) ORDER BY member.name), '[]'::jsonb) INTO member_facts
    FROM public.cwl_members AS member
    LEFT JOIN public.member_availability AS availability ON availability.clan_tag = member.clan_tag AND availability.season_id = member.season_id AND availability.player_tag = member.player_tag
    LEFT JOIN public.member_roster_overview AS roster ON roster.clan_tag = member.clan_tag AND roster.player_tag = member.player_tag AND roster.is_current_member
    LEFT JOIN public.cwl_current_reliability AS reliability ON reliability.clan_tag = member.clan_tag AND reliability.season_id = member.season_id AND reliability.player_tag = member.player_tag
    LEFT JOIN public.cwl_eight_star_eligibility AS eligibility ON eligibility.clan_tag = member.clan_tag AND eligibility.season_id = member.season_id AND eligibility.player_tag = member.player_tag
    LEFT JOIN public.regular_war_member_history AS regular_history ON regular_history.clan_tag = member.clan_tag AND regular_history.player_tag = member.player_tag
    LEFT JOIN public.regular_war_clan_history AS regular_clan ON regular_clan.clan_tag = member.clan_tag
    LEFT JOIN public.cwl_member_bonus_progress AS bonus ON bonus.clan_tag = member.clan_tag AND bonus.season_id = member.season_id AND bonus.player_tag = member.player_tag
    WHERE member.clan_tag = current_season.clan_tag AND member.season_id = current_season.season_id;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'playerTag', assignment.player_tag,
        'position', assignment.map_position,
        'isCore', assignment.map_position <= current_season.target_core_size
    ) ORDER BY assignment.map_position), '[]'::jsonb) INTO current_lineup
    FROM public.cwl_war_members AS assignment WHERE assignment.war_tag = current_war.war_tag;

    RETURN jsonb_build_object(
        'clanTag', current_season.clan_tag,
        'seasonId', current_season.season_id,
        'warTag', current_war.war_tag,
        'input', jsonb_build_object(
            'schemaVersion', 2,
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
                'collectionHealth', jsonb_build_object('status', COALESCE(latest_run.status::text, 'error'), 'collectedAt', latest_run.last_fresh_at, 'message', latest_run.error_message)
            )
        )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_recommendation_context(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_recommendation_context(text) TO authenticated, service_role;
