-- `member_daily_snapshots` and `clan_roster_daily_observations` carry
-- leader-only RLS policies but were never granted to `authenticated`, and
-- `member_roster_overview` reads them as a security-invoker view. A leader
-- selecting from that view therefore gets "permission denied for table
-- member_daily_snapshots" — the policies were dead without the grant. The
-- windowed function below enumerates roster members from the same table, so it
-- needs the same read.
GRANT SELECT ON public.clan_roster_daily_observations, public.member_daily_snapshots
    TO authenticated;

-- Regular-war participation scoped to a recent period. `regular_war_member_activity`
-- has no date filter, so every surface showing attacks used, opportunities, and
-- stars can only show them for all time.
--
-- The window is a parameter rather than hard-coded lateral joins like the
-- `baseline_1d` / `baseline_7d` / `baseline_30d` shape in `member_roster_overview`:
-- which windows a surface offers is still a moving design decision, and a
-- parameter keeps changing it a UI change instead of a migration.
--
-- `wars_observed` is scoped to the same window and repeats on every row —
-- "joined 3 of 5 wars" is only true when both halves cover the same period.
--
-- A war belongs to a window by its recorded `end_time`, so an ended war with no
-- recorded end time counts in the lifetime gauge and falls in no window. A war
-- that cannot be placed in time cannot be claimed to fall inside a period; that
-- is a coverage gap to report, not a participation penalty.
--
-- Rows cover every member the clan has observed, not only members who appeared
-- in a war during the window, so sitting out reads as zero of the window's wars
-- rather than as a missing row.
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
    WITH bounds AS (
        SELECT
            now() - make_interval(days => requested_window_days) AS started_at,
            now() AS ended_at
    ),
    windowed_wars AS (
        SELECT war.war_key, war.end_time, war.finalization_status
        FROM public.regular_wars AS war, bounds
        WHERE war.clan_tag = requested_clan_tag
          AND war.state != 'preparation'
          AND war.end_time IS NOT NULL
          AND war.end_time > bounds.started_at
          AND war.end_time <= bounds.ended_at
    ),
    participation AS (
        SELECT
            member.player_tag AS observed_player_tag,
            count(DISTINCT war.war_key)::integer AS wars_participated,
            coalesce(sum(member.assigned_attacks), 0)::integer AS assigned_attacks,
            coalesce(sum(member.attacks_made), 0)::integer AS attacks_made,
            coalesce(sum(member.stars), 0)::integer AS stars,
            max(war.end_time) AS last_observed_at,
            count(*) FILTER (WHERE war.finalization_status = 'incomplete')::integer AS incomplete_wars
        FROM windowed_wars AS war
        INNER JOIN public.regular_war_members AS member
            ON member.war_key = war.war_key
        GROUP BY member.player_tag
    ),
    known_members AS (
        SELECT DISTINCT snapshot.player_tag AS known_player_tag
        FROM public.member_daily_snapshots AS snapshot
        WHERE snapshot.clan_tag = requested_clan_tag
        UNION
        SELECT participation.observed_player_tag
        FROM participation
    )
    SELECT
        requested_clan_tag,
        known_members.known_player_tag,
        requested_window_days,
        bounds.started_at,
        (SELECT count(*)::integer FROM windowed_wars),
        coalesce(participation.wars_participated, 0),
        coalesce(participation.assigned_attacks, 0),
        coalesce(participation.attacks_made, 0),
        coalesce(participation.stars, 0),
        participation.last_observed_at,
        CASE
            WHEN coalesce(participation.assigned_attacks, 0) = 0 THEN NULL
            ELSE round(100 * participation.attacks_made::numeric / participation.assigned_attacks)
        END,
        CASE
            WHEN coalesce(participation.attacks_made, 0) = 0 THEN NULL
            ELSE least(100, round(100 * participation.stars::numeric / (3 * participation.attacks_made)))
        END,
        CASE
            WHEN coalesce(participation.attacks_made, 0) = 0 THEN NULL
            ELSE round(participation.stars::numeric / participation.attacks_made, 2)
        END,
        coalesce(participation.incomplete_wars, 0)
    FROM known_members
    CROSS JOIN bounds
    LEFT JOIN participation
        ON participation.observed_player_tag = known_members.known_player_tag;
END;
$$;

COMMENT ON FUNCTION public.regular_war_member_activity_window(text, integer) IS
    'Observed regular-war activity for one clan restricted to the last N days, with the clan war count restricted to the same period. Joins member_roster_overview on clan_tag and player_tag.';

REVOKE ALL ON FUNCTION public.regular_war_member_activity_window(text, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.regular_war_member_activity_window(text, integer)
    TO authenticated, service_role;
