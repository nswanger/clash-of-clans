-- The CWL rating reads a bounded regular-war window (#89).
--
-- WHAT WAS WRONG. `cwl_member_overall_rating` joined `regular_war_member_activity`
-- and `regular_war_clan_history` with no time bound at all, so every season got
-- the same regular-war figures: the ones as of whenever the query ran. #56 made
-- a previous season's review reachable and turned that from invisible into
-- wrong. Worse, both sources are INNER JOINs over `regular_war_members`, so a
-- member who appeared in NO war has no row, arrives NULL, and is
-- indistinguishable from a member the collector knows nothing about. A member
-- who sits out every war the clan fights is exactly who this rating exists to
-- surface.
--
-- AND THE RATING ITSELF WAS ABSENT WHEN IT WAS MOST NEEDED.
-- `cwl_completed_missed_attacks` filters `war_state = 'warEnded'`, so before any
-- war day ends a member has no rows, `assigned_opportunities` is 0, and
-- reliability is NULL -- not 0. `overall_rating` was NULL in turn. While a
-- leader builds the FIRST LINEUP OF A SEASON, nobody had a rating and the
-- recommender's `overall_rating` tie-break was inert. That is fixed here by
-- letting regular-war history constitute a rating on its own.
--
-- THE WINDOW IS "ANY WAR SINCE THE LAST CWL". CWL and regular wars cannot
-- overlap, so the rule is structurally free of double-counting, and it reads as
-- something a leader can verify against their own memory. Both bounds carry a
-- fallback and both report which branch fired, because a season whose lead-in
-- predates collection must say so rather than rate anybody on nothing.
--
-- THE DENOMINATOR IS EVERY ATTACK AVAILABLE IN THE WINDOW, sat-out wars
-- included. That is the one choice that turns non-participation into a real
-- zero, and it is fair because regular-war entry is SELF-SELECTED: the game
-- auto-places signed-up members, so appearing in a war is at the member's own
-- request and `team_size` is not a gate they do not control. CWL has no
-- equivalent signup, which is what this app exists to compensate for.
--
-- Supersedes ADR 0001's separation of the regular-war gauge from the rating.

-- ---------------------------------------------------------------------------
-- The aggregation, defined once
-- ---------------------------------------------------------------------------

-- Explicit bounds rather than a day count, because the CWL window is anchored
-- to a season rather than to `now()` and cannot be expressed as "N days ago".
-- `regular_war_member_activity_window` below becomes a thin wrapper on this, so
-- there is ONE definition of what regular-war activity means and the members
-- roster and the CWL rating cannot drift apart -- which is exactly how the
-- all-time view and the windowed function came to disagree in the first place.
CREATE OR REPLACE FUNCTION public.regular_war_member_activity_between(
    requested_clan_tag text,
    requested_from timestamptz,
    requested_to timestamptz
)
RETURNS TABLE (
    clan_tag text,
    player_tag text,
    window_from timestamptz,
    window_to timestamptz,
    wars_observed integer,
    wars_participated integer,
    available_attacks integer,
    assigned_attacks integer,
    attacks_made integer,
    stars integer,
    last_observed_at timestamptz,
    activity_score numeric,
    performance_score numeric,
    stars_per_attack numeric,
    opportunity_score numeric,
    quality_score numeric,
    regular_score numeric,
    incomplete_wars integer
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    IF requested_from IS NULL OR requested_to IS NULL THEN
        RAISE EXCEPTION 'A regular-war activity window needs both bounds'
            USING ERRCODE = '22023';
    END IF;
    IF requested_from >= requested_to THEN
        RAISE EXCEPTION 'A regular-war activity window must start before it ends'
            USING ERRCODE = '22023';
    END IF;

    RETURN QUERY
    WITH window_wars AS (
        SELECT war.war_key, war.end_time, war.preparation_start_time,
               war.attacks_per_member, war.finalization_status
        FROM public.regular_wars AS war
        WHERE war.clan_tag = requested_clan_tag
          AND war.state <> 'preparation'
          AND war.end_time IS NOT NULL
          AND war.end_time > requested_from
          AND war.end_time <= requested_to
    ),
    /* First observation is a FLOOR on when a member joined, not a join date:
       collection began long after the clan did, so every founding member reads
       as arriving on the day collection started. It is used only to avoid
       measuring somebody against a war that began before they could possibly
       have been in it, and it gets more accurate on its own as snapshot history
       deepens. */
    snapshot_members AS (
        SELECT snapshot.player_tag, min(snapshot.roster_observed_at) AS first_observed_at
        FROM public.member_daily_snapshots AS snapshot
        WHERE snapshot.clan_tag = requested_clan_tag
        GROUP BY snapshot.player_tag
    ),
    /* When the clan itself was first observed. Without this the buffer below
       reads "collection started" as "this member joined" and deletes the war
       history of every founding member -- the younger the observation history,
       the more it deletes. A member first seen in the clan's OWN first roster
       pull was already there; only somebody who appeared later has a first
       observation that means anything like a join. */
    clan_first_observed AS (
        SELECT min(snapshot_members.first_observed_at) AS observed_at
        FROM snapshot_members
    ),
    war_members AS (
        SELECT DISTINCT participant.player_tag
        FROM window_wars AS war
        INNER JOIN public.regular_war_members AS participant
            ON participant.war_key = war.war_key
    ),
    /* Every member the clan has observed, not only members who appeared in a
       war -- so sitting out reads as zero of the window's wars rather than as a
       missing row. FULL OUTER because a member can be in a war without ever
       appearing in a roster pull. */
    known_members AS (
        SELECT
            coalesce(snapshot_members.player_tag, war_members.player_tag) AS known_player_tag,
            snapshot_members.first_observed_at
        FROM snapshot_members
        FULL OUTER JOIN war_members
            ON war_members.player_tag = snapshot_members.player_tag
    ),
    /* The two-day buffer is the clan-change war lockout: a member cannot join a
       war that was already in preparation when they arrived, so counting it
       against them would be a penalty for the calendar. */
    eligible_wars AS (
        SELECT known_members.known_player_tag, war.war_key, war.end_time,
               war.attacks_per_member, war.finalization_status
        FROM known_members
        CROSS JOIN window_wars AS war
        WHERE known_members.first_observed_at IS NULL
           OR known_members.first_observed_at
              <= (SELECT clan_first_observed.observed_at FROM clan_first_observed)
           OR coalesce(war.preparation_start_time, war.end_time)
              >= known_members.first_observed_at + interval '2 days'
    ),
    participation AS (
        SELECT
            eligible.known_player_tag,
            count(DISTINCT eligible.war_key)::integer AS wars_observed,
            coalesce(sum(eligible.attacks_per_member), 0)::integer AS available_attacks,
            count(DISTINCT participant.war_key)::integer AS wars_participated,
            coalesce(sum(participant.assigned_attacks), 0)::integer AS assigned_attacks,
            coalesce(sum(participant.attacks_made), 0)::integer AS attacks_made,
            coalesce(sum(participant.stars), 0)::integer AS stars,
            max(eligible.end_time) FILTER (WHERE participant.war_key IS NOT NULL) AS last_observed_at,
            count(*) FILTER (
                WHERE participant.war_key IS NOT NULL
                  AND eligible.finalization_status = 'incomplete'
            )::integer AS incomplete_wars
        FROM eligible_wars AS eligible
        LEFT JOIN public.regular_war_members AS participant
            ON participant.war_key = eligible.war_key
           AND participant.player_tag = eligible.known_player_tag
        GROUP BY eligible.known_player_tag
    ),
    scored AS (
        SELECT
            known_members.known_player_tag,
            coalesce(participation.wars_observed, 0) AS wars_observed,
            coalesce(participation.wars_participated, 0) AS wars_participated,
            coalesce(participation.available_attacks, 0) AS available_attacks,
            coalesce(participation.assigned_attacks, 0) AS assigned_attacks,
            coalesce(participation.attacks_made, 0) AS attacks_made,
            coalesce(participation.stars, 0) AS stars,
            participation.last_observed_at,
            coalesce(participation.incomplete_wars, 0) AS incomplete_wars,
            /* Attacks made against every attack the window offered them. This
               is the term that makes a sitter-out a zero. NULL only when the
               window offered nothing at all, which says nothing about anybody. */
            CASE
                WHEN coalesce(participation.available_attacks, 0) = 0 THEN NULL
                /* Capped, because the two numbers come from different rows: the
                   denominator is the war's `attacks_per_member`, the numerator
                   the member's own recorded attacks, and a war record that
                   disagrees with its member records must not produce a rating
                   above 100. */
                ELSE least(1::numeric,
                     coalesce(participation.attacks_made, 0)::numeric
                     / participation.available_attacks)
            END AS opportunity_rate,
            /* How well they attacked WHEN they attacked. Zero rather than NULL
               when they made none, so it can be weighted without a special
               case: somebody who did not attack earns no quality credit. */
            CASE
                WHEN coalesce(participation.attacks_made, 0) = 0 THEN 0::numeric
                ELSE least(1::numeric,
                     participation.stars::numeric / (3 * participation.attacks_made))
            END AS quality_rate
        FROM known_members
        LEFT JOIN participation
            ON participation.known_player_tag = known_members.known_player_tag
    )
    SELECT
        requested_clan_tag,
        scored.known_player_tag,
        requested_from,
        requested_to,
        scored.wars_observed,
        scored.wars_participated,
        scored.available_attacks,
        scored.assigned_attacks,
        scored.attacks_made,
        scored.stars,
        scored.last_observed_at,
        /* Kept for the members roster, which asks a different question: of the
           attacks you were GIVEN, how many did you use. */
        CASE
            WHEN scored.assigned_attacks = 0 THEN NULL
            ELSE round(100 * scored.attacks_made::numeric / scored.assigned_attacks)
        END,
        CASE
            WHEN scored.attacks_made = 0 THEN NULL
            ELSE least(100, round(100 * scored.stars::numeric / (3 * scored.attacks_made)))
        END,
        CASE
            WHEN scored.attacks_made = 0 THEN NULL
            ELSE round(scored.stars::numeric / scored.attacks_made, 2)
        END,
        CASE WHEN scored.opportunity_rate IS NULL THEN NULL
             ELSE round(100 * scored.opportunity_rate) END,
        CASE WHEN scored.opportunity_rate IS NULL THEN NULL
             ELSE round(100 * scored.quality_rate) END,
        /* Attendance dominates because consistency across wars is what this
           measures; quality separates members who are otherwise equal. Composed
           from the raw rates rather than from the two rounded scores above, so
           the published number is not a sum of rounding errors. */
        CASE
            WHEN scored.opportunity_rate IS NULL THEN NULL
            ELSE round(100 * (0.7 * scored.opportunity_rate + 0.3 * scored.quality_rate))
        END,
        scored.incomplete_wars
    FROM scored;
END;
$$;

COMMENT ON FUNCTION public.regular_war_member_activity_between(text, timestamptz, timestamptz) IS
    'Observed regular-war activity for one clan between two instants, covering every member the clan has observed so a sitter-out reads as zero. Denominator is every attack the window offered.';

REVOKE ALL ON FUNCTION public.regular_war_member_activity_between(text, timestamptz, timestamptz) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.regular_war_member_activity_between(text, timestamptz, timestamptz)
    TO authenticated, service_role;

-- The members roster's entry point, unchanged in signature, column names and
-- behaviour -- it is now a wrapper so that "regular-war activity" has one
-- definition rather than two that drift. Its callers need no edit.
CREATE OR REPLACE FUNCTION public.regular_war_member_activity_window(
    requested_clan_tag text,
    requested_window_days integer
)
RETURNS TABLE (
    clan_tag text,
    player_tag text,
    window_days integer,
    window_started_at timestamptz,
    wars_observed integer,
    wars_participated integer,
    assigned_attacks integer,
    attacks_made integer,
    stars integer,
    last_observed_at timestamptz,
    activity_score numeric,
    performance_score numeric,
    stars_per_attack numeric,
    incomplete_wars integer
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    IF requested_window_days IS NULL OR requested_window_days <= 0 THEN
        RAISE EXCEPTION 'Activity window must be a positive number of days'
            USING ERRCODE = '22023';
    END IF;

    RETURN QUERY
    SELECT
        activity.clan_tag,
        activity.player_tag,
        requested_window_days,
        activity.window_from,
        activity.wars_observed,
        activity.wars_participated,
        activity.assigned_attacks,
        activity.attacks_made,
        activity.stars,
        activity.last_observed_at,
        activity.activity_score,
        activity.performance_score,
        activity.stars_per_attack,
        activity.incomplete_wars
    FROM public.regular_war_member_activity_between(
        requested_clan_tag,
        now() - make_interval(days => requested_window_days),
        now()
    ) AS activity;
END;
$$;

COMMENT ON FUNCTION public.regular_war_member_activity_window(text, integer) IS
    'Observed regular-war activity for one clan restricted to the last N days. A wrapper on regular_war_member_activity_between; the aggregation lives there (#89).';

-- ---------------------------------------------------------------------------
-- The window, per season
-- ---------------------------------------------------------------------------

-- Both bounds report which branch produced them. A season whose lead-in
-- predates regular-war collection has to be able to SAY so: "since the 2026-08
-- CWL" and "the 30 days before" are not the same claim, and a surface that
-- prints one when it means the other is the silent-wrong-answer failure #91
-- found in the season id readers.
CREATE OR REPLACE VIEW public.cwl_season_regular_window
WITH (security_invoker = true) AS
SELECT
    season.clan_tag,
    season.season_id,
    coalesce(season_start.prep_start, month_start.starts_at) AS window_to,
    CASE WHEN season_start.prep_start IS NOT NULL
         THEN 'season_preparation_start' ELSE 'season_month_start' END AS window_to_basis,
    coalesce(
        previous_cwl.last_end,
        coalesce(season_start.prep_start, month_start.starts_at) - interval '30 days'
    ) AS window_from,
    CASE WHEN previous_cwl.last_end IS NOT NULL
         THEN 'previous_cwl_end' ELSE 'fixed_30_days' END AS window_from_basis
FROM public.cwl_seasons AS season
/* The season id is the Clash API's own `season` field stored verbatim, which is
   a DATE (`2026-08-01`), not `YYYY-MM` -- see #91 and `cwl-season-id.ts`. Both
   shapes are accepted for the same reason that module accepts both, and the
   month key is what gets compared, because `2026-08` and `2026-09-01` do not
   sort against each other the way a reader expects. */
LEFT JOIN LATERAL (
    SELECT (left(season.season_id, 7) || '-01 00:00:00+00')::timestamptz AS starts_at
    WHERE season.season_id ~ '^\d{4}-(0[1-9]|1[0-2])(-\d{2})?$'
) AS month_start ON true
LEFT JOIN LATERAL (
    SELECT min(war.preparation_start_time) AS prep_start
    FROM public.cwl_wars AS war
    WHERE war.clan_tag = season.clan_tag
      AND war.season_id = season.season_id
      AND war.preparation_start_time IS NOT NULL
) AS season_start ON true
/* `min()` over whatever war days exist, rather than day 1 specifically: when
   day 1's collection was missed this degrades to day 2's preparation start
   (~24h later) instead of dropping all the way to the month floor. */
LEFT JOIN LATERAL (
    SELECT max(war.end_time) AS last_end
    FROM public.cwl_wars AS war
    WHERE war.clan_tag = season.clan_tag
      AND war.end_time IS NOT NULL
      AND left(war.season_id, 7) = (
          SELECT max(left(previous.season_id, 7))
          FROM public.cwl_seasons AS previous
          WHERE previous.clan_tag = season.clan_tag
            AND left(previous.season_id, 7) < left(season.season_id, 7)
      )
) AS previous_cwl ON true;

COMMENT ON VIEW public.cwl_season_regular_window IS
    'The regular-war window leading into each CWL season: from the previous CWL''s last war end to this season''s preparation start, with a fallback and a basis for each bound (#89).';

GRANT SELECT ON public.cwl_season_regular_window TO authenticated;

-- One aggregation call per season rather than per member: the LATERAL runs
-- against `cwl_season_regular_window`, which has a single row per season.
CREATE OR REPLACE VIEW public.cwl_season_regular_activity
WITH (security_invoker = true) AS
SELECT
    season_window.clan_tag,
    season_window.season_id,
    season_window.window_from,
    season_window.window_to,
    season_window.window_from_basis,
    season_window.window_to_basis,
    activity.player_tag,
    activity.wars_observed,
    activity.wars_participated,
    activity.available_attacks,
    activity.assigned_attacks,
    activity.attacks_made,
    activity.stars,
    activity.last_observed_at,
    activity.activity_score,
    activity.performance_score,
    activity.stars_per_attack,
    activity.opportunity_score,
    activity.quality_score,
    activity.regular_score,
    activity.incomplete_wars
FROM public.cwl_season_regular_window AS season_window
CROSS JOIN LATERAL public.regular_war_member_activity_between(
    season_window.clan_tag, season_window.window_from, season_window.window_to
) AS activity;

GRANT SELECT ON public.cwl_season_regular_activity TO authenticated;

-- Scoped to the CWL signup roster. The function's job is regular-war activity
-- for a clan over a window; who is in a given CWL is this view's question, and
-- `cwl_members` is the league group's own member list.
CREATE OR REPLACE VIEW public.cwl_member_regular_activity
WITH (security_invoker = true) AS
SELECT
    member.clan_tag,
    member.season_id,
    member.player_tag,
    season_window.window_from,
    season_window.window_to,
    season_window.window_from_basis,
    season_window.window_to_basis,
    coalesce(activity.wars_observed, 0)::integer AS wars_observed,
    coalesce(activity.wars_participated, 0)::integer AS wars_participated,
    coalesce(activity.available_attacks, 0)::integer AS available_attacks,
    coalesce(activity.assigned_attacks, 0)::integer AS assigned_attacks,
    coalesce(activity.attacks_made, 0)::integer AS attacks_made,
    coalesce(activity.stars, 0)::integer AS stars,
    activity.last_observed_at,
    activity.activity_score,
    activity.performance_score,
    activity.stars_per_attack,
    activity.opportunity_score,
    activity.quality_score,
    activity.regular_score,
    coalesce(activity.incomplete_wars, 0)::integer AS incomplete_wars
FROM public.cwl_members AS member
JOIN public.cwl_season_regular_window AS season_window
    ON season_window.clan_tag = member.clan_tag
   AND season_window.season_id = member.season_id
/* LEFT, not INNER: a CWL member the roster pulls have never seen would
   otherwise vanish from the rating entirely, which is the missing-row failure
   this migration exists to remove. */
LEFT JOIN public.cwl_season_regular_activity AS activity
    ON activity.clan_tag = member.clan_tag
   AND activity.season_id = member.season_id
   AND activity.player_tag = member.player_tag;

GRANT SELECT ON public.cwl_member_regular_activity TO authenticated;

-- ---------------------------------------------------------------------------
-- The rating
-- ---------------------------------------------------------------------------

DROP VIEW public.cwl_member_overall_rating;

CREATE VIEW public.cwl_member_overall_rating
WITH (security_invoker = true) AS
SELECT
    member.clan_tag,
    member.season_id,
    member.player_tag,
    regular.window_from AS regular_window_from,
    regular.window_to AS regular_window_to,
    regular.window_from_basis AS regular_window_from_basis,
    regular.window_to_basis AS regular_window_to_basis,
    coalesce(regular.wars_observed, 0)::integer AS regular_wars_observed,
    coalesce(regular.wars_participated, 0)::integer AS regular_wars_participated,
    coalesce(regular.available_attacks, 0)::integer AS regular_available_attacks,
    coalesce(regular.assigned_attacks, 0)::integer AS regular_assigned_attacks,
    coalesce(regular.attacks_made, 0)::integer AS regular_attacks_made,
    coalesce(regular.stars, 0)::integer AS regular_stars,
    coalesce(regular.incomplete_wars, 0)::integer AS regular_wars_incomplete,
    regular.activity_score AS regular_activity_score,
    regular.performance_score AS regular_performance_score,
    regular.stars_per_attack AS regular_stars_per_attack,
    regular.opportunity_score AS regular_opportunity_score,
    regular.quality_score AS regular_quality_score,
    regular.regular_score AS regular_score,
    regular.last_observed_at AS regular_last_observed_at,
    CASE WHEN reliability.reliability IS NULL THEN NULL
         ELSE round(100 * reliability.reliability) END AS cwl_score,
    /* Which evidence the rating is made of. Two members can both read 80 and
       mean different things, and the list ranks them against each other, so the
       basis travels with the number rather than being inferred from which
       columns happen to be NULL. `limited_confidence` is the precedent. */
    CASE
        WHEN reliability.reliability IS NOT NULL AND regular.regular_score IS NOT NULL THEN 'blended'
        WHEN reliability.reliability IS NOT NULL THEN 'reliability_only'
        WHEN regular.regular_score IS NOT NULL THEN 'regular_only'
        ELSE NULL
    END AS rating_basis,
    CASE
        /* 0.4 on a month of regular wars stops a single early war day -- two
           attacks -- from erasing it. */
        WHEN reliability.reliability IS NOT NULL AND regular.regular_score IS NOT NULL
            THEN round(0.6 * 100 * reliability.reliability + 0.4 * regular.regular_score)
        WHEN reliability.reliability IS NOT NULL
            THEN round(100 * reliability.reliability)
        /* The day-1 case, and the reason this migration matters most. Before
           any war day ends reliability is NULL, so until now every member read
           "No CWL rating yet" at exactly the moment a leader is choosing a
           lineup. Regular-war history can carry the rating alone. */
        WHEN regular.regular_score IS NOT NULL
            THEN regular.regular_score
        ELSE NULL
    END AS overall_rating,
    coalesce(bonus.wars_participated, 0)::integer AS cwl_wars_participated,
    coalesce(bonus.stars, 0)::integer AS cwl_stars,
    CASE
        WHEN coalesce(bonus.stars, 0) >= 8 THEN NULL
        ELSE bonus.bonus_priority_score
    END AS bonus_priority_score
FROM public.cwl_members AS member
LEFT JOIN public.cwl_member_reliability AS reliability
    ON reliability.clan_tag = member.clan_tag
   AND reliability.season_id = member.season_id
   AND reliability.player_tag = member.player_tag
LEFT JOIN public.cwl_member_regular_activity AS regular
    ON regular.clan_tag = member.clan_tag
   AND regular.season_id = member.season_id
   AND regular.player_tag = member.player_tag
LEFT JOIN public.cwl_member_bonus_progress AS bonus
    ON bonus.clan_tag = member.clan_tag
   AND bonus.season_id = member.season_id
   AND bonus.player_tag = member.player_tag;

GRANT SELECT ON public.cwl_member_overall_rating TO authenticated;

-- ---------------------------------------------------------------------------
-- The recommendation context
-- ---------------------------------------------------------------------------

-- Re-emitted so the function and the view cannot drift. `get_recommendation_context`
-- computes the same rating inline from the same sources, and #89 named that
-- drift as the risk of changing only one of them. A view binds its dependencies
-- by OID; a PL/pgSQL body is TEXT resolved at execution time, so this one has to
-- be rewritten by hand every time the shape underneath it moves.
--
-- `schemaVersion` goes to 4. A persisted recommendation input at version 3
-- predates the blend, so `overallRating` does not mean the same thing across the
-- boundary and a reader must not assume it does.

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
        'regularWindowFrom', rating.regular_window_from,
        'regularWindowTo', rating.regular_window_to,
        'regularWarsObserved', COALESCE(rating.regular_wars_observed, 0),
        'regularWarsParticipated', COALESCE(rating.regular_wars_participated, 0),
        'regularAvailableAttacks', COALESCE(rating.regular_available_attacks, 0),
        'regularAssignedAttacks', COALESCE(rating.regular_assigned_attacks, 0),
        'regularAttacksMade', COALESCE(rating.regular_attacks_made, 0),
        'regularActivityScore', rating.regular_activity_score,
        'regularPerformanceScore', rating.regular_performance_score,
        'regularStarsPerAttack', rating.regular_stars_per_attack,
        'regularOpportunityScore', rating.regular_opportunity_score,
        'regularQualityScore', rating.regular_quality_score,
        'regularScore', rating.regular_score,
        'regularLastObservedAt', rating.regular_last_observed_at,
        'cwlScore', rating.cwl_score,
        'ratingBasis', rating.rating_basis,
        'overallRating', rating.overall_rating,
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
    /* The rating comes from the view rather than being recomputed here. That is
       the whole point: two copies of one formula is how the all-time join
       survived in this function after the view had already moved on. */
    LEFT JOIN public.cwl_member_overall_rating AS rating
        ON rating.clan_tag = member.clan_tag
       AND rating.season_id = member.season_id
       AND rating.player_tag = member.player_tag
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
            'schemaVersion', 4,
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

-- ---------------------------------------------------------------------------
-- Deprecations
-- ---------------------------------------------------------------------------

-- NOT DROPPED HERE, deliberately. The live app still reads
-- `regular_war_member_activity` (`operations.ts`, the lineup workspace), and
-- Pages deploys on merge while the database does not (ADR 0003) -- so dropping
-- a view the shipped surface reads would break production the moment this is
-- pushed, which is the exact failure `scripts/check-migrations.sh` exists to
-- prevent, run backwards. They lose their last caller when the surfaces in this
-- change ship; a follow-up migration drops them after that.
COMMENT ON VIEW public.regular_war_member_activity IS
    'DEPRECATED (#89): all-time and INNER JOINed, so a non-participant is indistinguishable from a member with no data. Use regular_war_member_activity_between. Dropped once no surface reads it.';
COMMENT ON VIEW public.regular_war_clan_history IS
    'DEPRECATED (#89): the all-time denominator matching regular_war_member_activity. Use the windowed wars_observed. Dropped once no surface reads it.';
