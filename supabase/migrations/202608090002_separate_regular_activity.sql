CREATE OR REPLACE VIEW public.regular_war_member_activity
WITH (security_invoker = true) AS
SELECT
    war.clan_tag,
    member.player_tag,
    count(DISTINCT war.war_key)::integer AS wars_participated,
    coalesce(sum(member.assigned_attacks), 0)::integer AS assigned_attacks,
    coalesce(sum(member.attacks_made), 0)::integer AS attacks_made,
    coalesce(sum(member.stars), 0)::integer AS stars,
    max(war.end_time) AS last_observed_at,
    CASE
        WHEN coalesce(sum(member.assigned_attacks), 0) = 0 THEN NULL
        ELSE round(100 * sum(member.attacks_made)::numeric / sum(member.assigned_attacks))
    END AS activity_score,
    CASE
        WHEN coalesce(sum(member.attacks_made), 0) = 0 THEN NULL
        ELSE least(100, round(100 * sum(member.stars)::numeric / (3 * sum(member.attacks_made))))
    END AS performance_score,
    CASE
        WHEN coalesce(sum(member.attacks_made), 0) = 0 THEN NULL
        ELSE round(sum(member.stars)::numeric / sum(member.attacks_made), 2)
    END AS stars_per_attack
FROM public.regular_wars AS war
INNER JOIN public.regular_war_members AS member
    ON member.war_key = war.war_key
WHERE war.state != 'preparation'
  AND (war.state = 'warEnded' OR (war.end_time IS NOT NULL AND war.end_time <= now()))
GROUP BY war.clan_tag, member.player_tag;

GRANT SELECT ON public.regular_war_member_activity TO authenticated;

DROP VIEW public.cwl_member_overall_rating;

CREATE VIEW public.cwl_member_overall_rating
WITH (security_invoker = true) AS
SELECT
    member.clan_tag,
    member.season_id,
    member.player_tag,
    coalesce(regular_clan.wars_observed, 0)::integer AS regular_wars_observed,
    coalesce(regular_activity.wars_participated, 0)::integer AS regular_wars_participated,
    coalesce(regular_activity.assigned_attacks, 0)::integer AS regular_assigned_attacks,
    coalesce(regular_activity.attacks_made, 0)::integer AS regular_attacks_made,
    CASE
        WHEN coalesce(regular_activity.assigned_attacks, 0) = 0 THEN NULL
        ELSE round(100 * regular_activity.attacks_made::numeric / regular_activity.assigned_attacks)
    END AS regular_activity_score,
    CASE
        WHEN coalesce(regular_activity.attacks_made, 0) = 0 THEN NULL
        ELSE least(100, round(100 * regular_activity.stars::numeric / (3 * regular_activity.attacks_made)))
    END AS regular_performance_score,
    regular_activity.stars_per_attack AS regular_stars_per_attack,
    regular_activity.last_observed_at AS regular_last_observed_at,
    CASE
        WHEN reliability.reliability IS NULL THEN NULL
        ELSE round(100 * reliability.reliability)
    END AS overall_rating,
    coalesce(bonus.wars_participated, 0)::integer AS cwl_wars_participated,
    coalesce(bonus.stars, 0)::integer AS cwl_stars,
    CASE
        WHEN coalesce(bonus.stars, 0) >= 8 THEN NULL
        ELSE bonus.bonus_priority_score
    END AS bonus_priority_score
FROM public.cwl_members AS member
LEFT JOIN public.cwl_current_reliability AS reliability
    ON reliability.clan_tag = member.clan_tag
   AND reliability.season_id = member.season_id
   AND reliability.player_tag = member.player_tag
LEFT JOIN public.regular_war_member_activity AS regular_activity
    ON regular_activity.clan_tag = member.clan_tag
   AND regular_activity.player_tag = member.player_tag
LEFT JOIN public.regular_war_clan_history AS regular_clan
    ON regular_clan.clan_tag = member.clan_tag
LEFT JOIN public.cwl_member_bonus_progress AS bonus
    ON bonus.clan_tag = member.clan_tag
   AND bonus.season_id = member.season_id
   AND bonus.player_tag = member.player_tag;

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
        'regularWarsParticipated', COALESCE(regular_activity.wars_participated, 0),
        'regularAssignedAttacks', COALESCE(regular_activity.assigned_attacks, 0),
        'regularAttacksMade', COALESCE(regular_activity.attacks_made, 0),
        'regularActivityScore', regular_activity.activity_score,
        'regularPerformanceScore', regular_activity.performance_score,
        'regularStarsPerAttack', regular_activity.stars_per_attack,
        'regularLastObservedAt', regular_activity.last_observed_at,
        'overallRating', CASE
            WHEN reliability.reliability IS NULL THEN NULL
            ELSE round(100 * reliability.reliability)
        END,
        'bonusPriorityScore', CASE WHEN COALESCE(eligibility.stars, 0) >= 8 THEN NULL ELSE bonus.bonus_priority_score END
    ) ORDER BY member.name), '[]'::jsonb) INTO member_facts
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
    LEFT JOIN public.regular_war_member_activity AS regular_activity
        ON regular_activity.clan_tag = member.clan_tag
       AND regular_activity.player_tag = member.player_tag
    LEFT JOIN public.regular_war_clan_history AS regular_clan
        ON regular_clan.clan_tag = member.clan_tag
    LEFT JOIN public.cwl_member_bonus_progress AS bonus
        ON bonus.clan_tag = member.clan_tag
       AND bonus.season_id = member.season_id
       AND bonus.player_tag = member.player_tag
    WHERE member.clan_tag = current_season.clan_tag
      AND member.season_id = current_season.season_id;

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
            'schemaVersion', 3,
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
