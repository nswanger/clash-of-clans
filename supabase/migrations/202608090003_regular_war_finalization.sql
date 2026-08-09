ALTER TABLE public.regular_wars
    ADD COLUMN finalization_status text NOT NULL DEFAULT 'pending'
        CHECK (finalization_status IN (
            'pending',
            'complete_war_ended',
            'complete_at_transition',
            'incomplete'
        )),
    ADD COLUMN finalization_observed_at timestamptz,
    ADD COLUMN last_observed_at timestamptz;

UPDATE public.regular_wars
SET finalization_status = 'complete_war_ended'
WHERE state = 'warEnded';

UPDATE public.regular_wars
SET finalization_status = 'incomplete'
WHERE finalization_status = 'pending'
  AND state != 'preparation'
  AND end_time IS NOT NULL
  AND end_time <= now();

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
        war_key,
        clan_tag,
        state,
        preparation_start_time,
        start_time,
        end_time,
        team_size,
        attacks_per_member,
        updated_at,
        finalization_status,
        finalization_observed_at,
        last_observed_at
    ) VALUES (
        v_war_key,
        p_war ->> 'clan_tag',
        p_war ->> 'state',
        (p_war ->> 'preparation_start_time')::timestamptz,
        (p_war ->> 'start_time')::timestamptz,
        (p_war ->> 'end_time')::timestamptz,
        (p_war ->> 'team_size')::smallint,
        coalesce((p_war ->> 'attacks_per_member')::smallint, 1),
        now(),
        coalesce(p_war ->> 'finalization_status', 'pending'),
        (p_war ->> 'finalization_observed_at')::timestamptz,
        coalesce((p_war ->> 'last_observed_at')::timestamptz, now())
    )
    ON CONFLICT (war_key) DO UPDATE SET
        clan_tag = excluded.clan_tag,
        state = excluded.state,
        preparation_start_time = excluded.preparation_start_time,
        start_time = excluded.start_time,
        end_time = excluded.end_time,
        team_size = excluded.team_size,
        attacks_per_member = excluded.attacks_per_member,
        updated_at = now(),
        finalization_status = CASE
            WHEN CASE regular_wars.finalization_status
                WHEN 'complete_war_ended' THEN 3
                WHEN 'complete_at_transition' THEN 2
                WHEN 'incomplete' THEN 1
                ELSE 0
            END >= CASE excluded.finalization_status
                WHEN 'complete_war_ended' THEN 3
                WHEN 'complete_at_transition' THEN 2
                WHEN 'incomplete' THEN 1
                ELSE 0
            END THEN regular_wars.finalization_status
            ELSE excluded.finalization_status
        END,
        finalization_observed_at = CASE
            WHEN CASE excluded.finalization_status
                WHEN 'complete_war_ended' THEN 3
                WHEN 'complete_at_transition' THEN 2
                WHEN 'incomplete' THEN 1
                ELSE 0
            END > CASE regular_wars.finalization_status
                WHEN 'complete_war_ended' THEN 3
                WHEN 'complete_at_transition' THEN 2
                WHEN 'incomplete' THEN 1
                ELSE 0
            END THEN excluded.finalization_observed_at
            ELSE regular_wars.finalization_observed_at
        END,
        last_observed_at = CASE
            WHEN regular_wars.last_observed_at IS NULL THEN excluded.last_observed_at
            WHEN excluded.last_observed_at IS NULL THEN regular_wars.last_observed_at
            ELSE greatest(regular_wars.last_observed_at, excluded.last_observed_at)
        END;

    DELETE FROM public.regular_war_members WHERE war_key = v_war_key;

    INSERT INTO public.regular_war_members (
        war_key,
        player_tag,
        name,
        town_hall_level,
        assigned_attacks,
        attacks_made,
        stars
    )
    SELECT
        war_key,
        player_tag,
        name,
        town_hall_level,
        assigned_attacks,
        attacks_made,
        stars
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

CREATE OR REPLACE FUNCTION public.finalize_regular_war_at_transition(
    p_clan_tag text,
    p_observed_at timestamptz,
    p_current_war_key text
)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_status text;
BEGIN
    UPDATE public.regular_wars AS war
    SET finalization_status = CASE
            WHEN war.last_observed_at IS NOT NULL
                AND war.end_time IS NOT NULL
                AND war.last_observed_at >= war.end_time
                THEN 'complete_at_transition'
            ELSE 'incomplete'
        END,
        finalization_observed_at = p_observed_at,
        updated_at = now()
    WHERE war.war_key = (
        SELECT candidate.war_key
        FROM public.regular_wars AS candidate
        WHERE candidate.clan_tag = p_clan_tag
          AND candidate.finalization_status = 'pending'
          AND (p_current_war_key IS NULL OR candidate.war_key != p_current_war_key)
        ORDER BY candidate.end_time DESC NULLS LAST,
            candidate.start_time DESC NULLS LAST,
            candidate.updated_at DESC
        LIMIT 1
    )
    RETURNING war.finalization_status INTO v_status;

    RETURN v_status;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_regular_war_at_transition(text, timestamptz, text)
    FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_regular_war_at_transition(text, timestamptz, text)
    TO service_role;

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
    END AS stars_per_attack,
    count(*) FILTER (WHERE war.finalization_status = 'incomplete')::integer AS incomplete_wars
FROM public.regular_wars AS war
INNER JOIN public.regular_war_members AS member
    ON member.war_key = war.war_key
WHERE war.state != 'preparation'
  AND (war.state = 'warEnded' OR (war.end_time IS NOT NULL AND war.end_time <= now()))
GROUP BY war.clan_tag, member.player_tag;

GRANT SELECT ON public.regular_war_member_activity TO authenticated;
