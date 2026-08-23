-- Every CWL view was scoped to the latest season, so a previous season was
-- collected but not queryable (#56). ADR 0002 requires a previous season's
-- review to stay reachable; the review and stand-down season menus carried
-- honestly-disabled entries because of this.
--
-- THE PARAMETER ALREADY EXISTED. `season_id` is a group-by key and an output
-- column on every one of these views, and every loader already filters on it.
-- The only thing narrowing them was an internal join to `cwl_current_seasons`.
-- So this is not a new season-parameterised family beside the current-season
-- one, and not a set of functions taking `season_id` -- both of which would
-- have broken the filters the callers already write. It is the removal of a
-- join, after which the callers' existing `season_id` filter is the parameter.
--
-- `cwl_current_seasons` stays, and keeps its name honestly: it is still the
-- latest season per clan, which is what a surface defaults to when the leader
-- has not picked one. What changes is that nothing is forced through it.
--
-- Only three bodies change. `cwl_completed_missed_attacks`,
-- `cwl_member_stars`, `cwl_member_opportunities` and `cwl_member_bonus_progress`
-- read the assignments view and widen with it, and `cwl_member_overall_rating`
-- already drove from `cwl_members` across all seasons.

-- The two views whose names claimed a scope they no longer have. Renamed rather
-- than dropped and recreated: dependent views bind by OID and follow the rename,
-- so `cwl_member_overall_rating` and `get_recommendation_context` keep working
-- untouched.
ALTER VIEW public.cwl_current_season_assignments RENAME TO cwl_season_assignments;
ALTER VIEW public.cwl_current_reliability RENAME TO cwl_member_reliability;

CREATE OR REPLACE VIEW public.cwl_season_assignments
WITH (security_invoker = true) AS
SELECT
  war.clan_tag,
  war.season_id,
  war.war_tag,
  war.war_day,
  war.state AS war_state,
  assignment.player_tag,
  assignment.map_position,
  assignment.town_hall_level,
  assignment.assigned_attacks
FROM public.cwl_wars war
JOIN public.cwl_war_members assignment ON assignment.war_tag = war.war_tag;

CREATE OR REPLACE VIEW public.cwl_eight_star_eligibility
WITH (security_invoker = true) AS
SELECT
  member.clan_tag,
  member.season_id,
  member.player_tag,
  coalesce(stars.stars, 0) AS stars,
  coalesce(stars.stars, 0) >= 8 AS eight_star_eligible
FROM public.cwl_members member
LEFT JOIN public.cwl_member_stars stars
  ON stars.clan_tag = member.clan_tag
 AND stars.season_id = member.season_id
 AND stars.player_tag = member.player_tag;

CREATE OR REPLACE VIEW public.cwl_member_reliability
WITH (security_invoker = true) AS
SELECT
  member.clan_tag,
  member.season_id,
  member.player_tag,
  coalesce(opportunities.assigned_opportunities, 0) AS assigned_opportunities,
  coalesce(opportunities.completed_assigned_attacks, 0) AS completed_assigned_attacks,
  CASE
    WHEN coalesce(opportunities.assigned_opportunities, 0) = 0 THEN NULL
    ELSE opportunities.completed_assigned_attacks::numeric / opportunities.assigned_opportunities
  END AS reliability,
  coalesce(opportunities.assigned_opportunities, 0) = 0 AS limited_confidence
FROM public.cwl_members member
LEFT JOIN public.cwl_member_opportunities opportunities
  ON opportunities.clan_tag = member.clan_tag
 AND opportunities.season_id = member.season_id
 AND opportunities.player_tag = member.player_tag;

GRANT SELECT ON public.cwl_season_assignments, public.cwl_member_reliability
  TO authenticated;

-- `get_recommendation_context` has to be re-emitted, and the reason is worth
-- stating because it is the one thing about this rename that is not obvious: a
-- view binds its dependencies by OID and follows a rename silently, but a
-- PL/pgSQL body is TEXT resolved at execution time. `cwl_member_overall_rating`
-- and `cwl_member_bonus_progress` therefore needed no change at all, while this
-- function would have failed at its next call with "relation
-- public.cwl_current_reliability does not exist".
--
-- Copied verbatim from 202608090002 with ONE line changed -- the view's name --
-- so the diff between the two definitions is exactly the rename and nothing
-- else. The grants below it are unchanged and are not re-emitted, because
-- CREATE OR REPLACE FUNCTION preserves the existing ACL.

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
    LEFT JOIN public.cwl_member_reliability AS reliability
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
