-- Drop the deprecated all-time regular-war views (#94).
--
-- `regular_war_member_activity` and `regular_war_clan_history` answer "regular-
-- war activity for this clan" with no time bound and an INNER JOIN over war
-- participation, so a non-participant has no row: the defect the windowed
-- replacements (`regular_war_member_activity_window`,
-- `regular_war_member_activity_between`) exist to remove (#89). 202608230002
-- marked both DEPRECATED but could not drop them, because the shipped app still
-- read `regular_war_member_activity` and Pages deploys after the database
-- (ADR 0003). That window has closed: nothing in apps/, packages/, or the
-- current schema references either view.

DROP VIEW IF EXISTS public.regular_war_member_activity;
DROP VIEW IF EXISTS public.regular_war_clan_history;
