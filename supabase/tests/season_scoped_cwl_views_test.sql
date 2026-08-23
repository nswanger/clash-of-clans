-- #56: a previous season was collected and not queryable. Every CWL view joined
-- `cwl_current_seasons`, so a previous season's rows existed and no query could
-- reach them, and ADR 0002 requires a previous season's review to stay
-- reachable. These tests are what "reachable" means: two seasons in the same
-- clan, and every derived view returning the older one's own figures under its
-- own `season_id` rather than the newer one's.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(12);

-- The names that stopped claiming a scope they no longer have.
SELECT has_view('public', 'cwl_season_assignments', 'the assignments view is named for a season rather than the current one');
SELECT has_view('public', 'cwl_member_reliability', 'the reliability view is named for a member rather than the current season');
SELECT hasnt_view('public', 'cwl_current_season_assignments', 'the current-season assignments view is gone');
SELECT hasnt_view('public', 'cwl_current_reliability', 'the current-season reliability view is gone');

-- `cwl_current_seasons` STAYS, and keeps its name honestly: it is still the
-- latest season per clan, which is what a surface defaults to when the leader
-- has not picked one. What changed is that nothing is forced through it.
SELECT has_view('public', 'cwl_current_seasons', 'the latest season per clan is still available as a default');

INSERT INTO public.cwl_seasons (clan_tag, season_id, war_size, target_core_size, rotation_positions)
VALUES ('#SCOPE', '2026-07', 15, 10, 5), ('#SCOPE', '2026-08', 15, 10, 5);

INSERT INTO public.cwl_wars (war_tag, clan_tag, season_id, war_day, state)
VALUES ('#OLDWAR', '#SCOPE', '2026-07', 1, 'warEnded'),
       ('#NEWWAR', '#SCOPE', '2026-08', 1, 'warEnded');

INSERT INTO public.cwl_members (clan_tag, season_id, player_tag, name, town_hall_level)
VALUES ('#SCOPE', '2026-07', '#PAST', 'Past Player', 16),
       ('#SCOPE', '2026-08', '#NOW', 'Present Player', 17);

INSERT INTO public.cwl_war_members (war_tag, player_tag, map_position, assigned_attacks)
VALUES ('#OLDWAR', '#PAST', 1, 1), ('#NEWWAR', '#NOW', 1, 1);

-- Deliberately different figures per season. Equal ones would pass whichever
-- season the view actually returned, which is the bug rather than the test.
INSERT INTO public.cwl_attacks (war_tag, attacker_tag, attack_order, stars, destruction)
VALUES ('#OLDWAR', '#PAST', 1, 3, 100), ('#NEWWAR', '#NOW', 1, 1, 40);

SELECT is(
    (SELECT count(*)::int FROM public.cwl_season_assignments
     WHERE clan_tag = '#SCOPE' AND season_id = '2026-07'),
    1,
    'a previous season has assignments'
);

SELECT is(
    (SELECT stars FROM public.cwl_member_stars
     WHERE clan_tag = '#SCOPE' AND season_id = '2026-07' AND player_tag = '#PAST'),
    3,
    'a previous season reports its own stars'
);

SELECT is(
    (SELECT completed_assigned_attacks FROM public.cwl_completed_missed_attacks
     WHERE clan_tag = '#SCOPE' AND season_id = '2026-07' AND player_tag = '#PAST'),
    1,
    'a previous season reports its own attack record'
);

SELECT is(
    (SELECT assigned_opportunities FROM public.cwl_member_opportunities
     WHERE clan_tag = '#SCOPE' AND season_id = '2026-07' AND player_tag = '#PAST'),
    1,
    'a previous season reports its own opportunities'
);

SELECT ok(
    (SELECT eight_star_eligible FROM public.cwl_eight_star_eligibility
     WHERE clan_tag = '#SCOPE' AND season_id = '2026-07' AND player_tag = '#PAST') IS NOT NULL,
    'a previous season''s members appear in eight-star eligibility'
);

SELECT is(
    (SELECT reliability FROM public.cwl_member_reliability
     WHERE clan_tag = '#SCOPE' AND season_id = '2026-07' AND player_tag = '#PAST'),
    1.0::numeric,
    'a previous season reports its own reliability'
);

-- The other half of the claim, and the one a widened view could quietly break:
-- widening must not merge the seasons. A member appears once per season with
-- that season's figures, not once with both seasons summed.
SELECT is(
    (SELECT count(*)::int FROM public.cwl_member_stars
     WHERE clan_tag = '#SCOPE' AND player_tag = '#PAST'),
    1,
    'a member has one row per season rather than one row across seasons'
);

SELECT * FROM finish();
ROLLBACK;
