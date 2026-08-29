-- The pre-season roll call (#96).
--
-- The clan's real availability process runs BEFORE CWL starts: a message goes to
-- clan chat in the last days of the month and everyone who likes it is available
-- for the upcoming season. The app had nowhere to put those answers, because
-- `member_availability` keys to `cwl_members` which keys to `cwl_seasons`, and a
-- season the API has not published has no row for availability to hang from.
--
-- THE STAGING TABLE HAS NO FOREIGN KEY INTO THE CWL TABLES, AND THAT IS THE
-- WHOLE DESIGN. It is the only structure writable before the season exists,
-- which is what makes "record availability before the first API pull of the
-- season" literally satisfiable rather than approximated.
--
-- The rejected alternative was a placeholder `cwl_seasons` row seeded with
-- members from the latest roster pull. It fails three ways: `cwl_current_seasons`
-- orders by `season_id DESC`, so the placeholder becomes the current season and
-- `defaultCwlPhase` returns `lineup` for a season with no war states — ending
-- stand down days early, which is ADR 0002's original defect from the other end;
-- `upsertMember` never prunes, so members fabricated for a season they were
-- never in stay in the denominator of the review surface and the rating; and it
-- means inventing API-derived rows in two tables that otherwise only
-- `normalizeGroup` writes.

-- Reading a season id as a month, in SQL. The TypeScript half is `seasonMonth` /
-- `seasonMonthKey` in `apps/web/src/cwl/cwl-season-id.ts`, and the two must agree:
-- production ids are `YYYY-MM-DD` (`2026-09-01`) while the roll call is keyed by
-- month (`2026-09`). Matching those with `LIKE` or a bare equality is the defect
-- #91 shipped twice, and it failed quietly both times.
--
-- `YYYY-MM` is accepted alongside `YYYY-MM-DD` for the same reason the reader is:
-- the API's contract is not ours to assume, and seasons already stored in the
-- short form must keep working. Anything else returns NULL, which every caller
-- here treats as "no roll call can match this season".
CREATE OR REPLACE FUNCTION public.cwl_season_month(season_id text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
    SELECT substring(btrim(season_id) FROM '^(\d{4}-(?:0[1-9]|1[0-2]))(?:-\d{2})?$');
$$;

COMMENT ON FUNCTION public.cwl_season_month(text) IS
    'The YYYY-MM month of a CWL season id, or NULL when the id cannot be read as one. Mirrors seasonMonth/seasonMonthKey in the web app (#91).';

-- PRESENCE OF A ROW MEANS "SAID YES". There is deliberately no status column:
-- the leader ticks the people who liked the message, so absence is the only
-- other state, and it means `unknown` rather than `unavailable`. Presuming an
-- answer from silence is what AGENTS.md forbids — absence of evidence is never a
-- penalty.
--
-- The month check constraint does the job the missing foreign key would have
-- done: it is what keeps `target_month` canonical, so `cwl_season_month` above
-- can match it.
CREATE TABLE public.cwl_roll_call (
    clan_tag text NOT NULL CHECK (btrim(clan_tag) <> ''),
    target_month text NOT NULL CHECK (target_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
    player_tag text NOT NULL CHECK (btrim(player_tag) <> ''),
    recorded_by uuid NOT NULL REFERENCES public.profiles(id),
    recorded_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (clan_tag, target_month, player_tag)
);

COMMENT ON TABLE public.cwl_roll_call IS
    'Who said yes to the pre-season availability message, for a month whose CWL season does not exist yet. No foreign key into the CWL tables by design: it must be writable before the season is collected (#96). Cleared when a later season seeds.';
COMMENT ON COLUMN public.cwl_roll_call.target_month IS
    'The YYYY-MM this roll call is for, from nextCwlStart(now) — the month the stand-down countdown is pointing at, not today plus one.';

-- THE PROVENANCE MARKER IS ITS OWN IMMUTABLE COLUMN, NOT A `source` ENUM ON THE
-- ROW. `saveAvailability` upserts `member_availability`, overwriting `status`,
-- `recorded_by` and `recorded_at`, so a source column would flip to "leader" the
-- first time the member is touched mid-season — destroying the one fact being
-- kept. A separate column written once by the seed survives every later edit.
--
-- Read together with `status` it separates the cases that matter: set +
-- `available` is a live promise, set + `unavailable` is a promise withdrawn
-- (with `recorded_at` saying when), NULL + `available` is a leader marking
-- someone available with no promise behind it. That is why a withdrawal needs no
-- second record — the status flip IS the record.
ALTER TABLE public.member_availability
    ADD COLUMN roll_call_at timestamptz;

COMMENT ON COLUMN public.member_availability.roll_call_at IS
    'When this member said yes in the pre-season roll call, or NULL if this availability did not come from one. IMMUTABLE BY DESIGN: written once by seed_cwl_roll_call and never by saveAvailability, so a later status change does not erase the fact that a promise was made (#96).';

ALTER TABLE public.cwl_roll_call ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Leaders read roll call"
    ON public.cwl_roll_call FOR SELECT TO authenticated
    USING (public.is_leader());

CREATE POLICY "Leaders write roll call"
    ON public.cwl_roll_call FOR ALL TO authenticated
    USING (public.is_leader())
    WITH CHECK (public.is_leader() AND recorded_by = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cwl_roll_call TO authenticated;

-- The seed, and it is LAZY AND IDEMPOTENT rather than a collector step or a
-- leader action.
--
-- Not the collector: it stays outbound-only and raw, and must not write
-- leader-owned decision state. Not a leader action: the entire requirement is
-- that the pre-season work is never repeated after signup, and a button on the
-- 1st is still a step to remember on the exact day the leader was trying to stop
-- depending on. Running here, under the leader's own session, gives
-- `recorded_by` an honest actor and costs no action at all.
--
-- There is no late-seed window to worry about: nothing reads availability except
-- a surface whose own load calls this, and the day-1 plan does not exist until
-- the workspace is opened.
CREATE OR REPLACE FUNCTION public.seed_cwl_roll_call(
    requested_clan_tag text,
    requested_season_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    current_user_id uuid := auth.uid();
    target text := public.cwl_season_month(requested_season_id);
    seeded integer := 0;
    unmatched jsonb := '[]'::jsonb;
    roll_call_taken_at timestamptz;
BEGIN
    IF NOT public.is_leader() THEN
        RAISE EXCEPTION 'Leader access required' USING ERRCODE = '42501';
    END IF;

    -- An unreadable season id matches no roll call, which is the same outcome as
    -- there being none. It is not an error: the id is the API's and this
    -- function is called on every season load.
    IF target IS NULL THEN
        RETURN jsonb_build_object('seeded', 0, 'unmatched', '[]'::jsonb, 'rollCallAt', NULL);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.cwl_seasons AS season
        WHERE season.clan_tag = requested_clan_tag
            AND season.season_id = requested_season_id
    ) THEN
        RAISE EXCEPTION 'CWL season was not found';
    END IF;

    -- STALE ROLL CALLS ARE DISCARDED SILENTLY, and the comparison is STRICTLY
    -- BEFORE rather than at-or-before. A roll call for a month whose season never
    -- landed — the collector broken through the 1st, or the clan skipping CWL —
    -- is only reachable when something louder is already wrong, so it is cleared
    -- on the way past rather than reported on a page whose whole ADR is about
    -- restraint.
    --
    -- Keeping the CURRENT month's rows is what lets the surface keep naming who
    -- said yes and did not make the group for the whole season, instead of once
    -- on the first load and never again. They are cleared by the next season's
    -- seed, which is the same rule one month later.
    DELETE FROM public.cwl_roll_call AS stale
    WHERE stale.clan_tag = requested_clan_tag
        AND stale.target_month < target;

    SELECT MAX(entry.recorded_at)
    INTO roll_call_taken_at
    FROM public.cwl_roll_call AS entry
    WHERE entry.clan_tag = requested_clan_tag
        AND entry.target_month = target;

    IF roll_call_taken_at IS NULL THEN
        RETURN jsonb_build_object('seeded', 0, 'unmatched', '[]'::jsonb, 'rollCallAt', NULL);
    END IF;

    -- ON CONFLICT DO NOTHING is the idempotence, and it is also the rule that a
    -- season already carrying availability is never overwritten. Re-running this
    -- after the leader has edited availability by hand must not undo the edit,
    -- and it must not resurrect `roll_call_at` on a row that never had one.
    WITH seeded_rows AS (
        INSERT INTO public.member_availability (
            clan_tag,
            season_id,
            player_tag,
            status,
            recorded_by,
            recorded_at,
            roll_call_at
        )
        SELECT
            entry.clan_tag,
            requested_season_id,
            entry.player_tag,
            'available'::public.availability_status,
            current_user_id,
            entry.recorded_at,
            entry.recorded_at
        FROM public.cwl_roll_call AS entry
        JOIN public.cwl_members AS member
            ON member.clan_tag = entry.clan_tag
            AND member.season_id = requested_season_id
            AND member.player_tag = entry.player_tag
        WHERE entry.clan_tag = requested_clan_tag
            AND entry.target_month = target
        ON CONFLICT (clan_tag, season_id, player_tag) DO NOTHING
        RETURNING 1
    )
    SELECT count(*)::integer INTO seeded FROM seeded_rows;

    -- WHO SAID YES AND DID NOT MAKE THE GROUP. The foreign key forbids writing
    -- them and they should not be written anyway — once the league group forms
    -- the CWL roster is fixed, so this arrives too late to act on and is
    -- reported rather than actioned. It is usually a leader oversight or a full
    -- roster, not a member failing, which is exactly why it is a note and never
    -- a penalty.
    SELECT COALESCE(jsonb_agg(entry.player_tag ORDER BY entry.player_tag), '[]'::jsonb)
    INTO unmatched
    FROM public.cwl_roll_call AS entry
    WHERE entry.clan_tag = requested_clan_tag
        AND entry.target_month = target
        AND NOT EXISTS (
            SELECT 1
            FROM public.cwl_members AS member
            WHERE member.clan_tag = entry.clan_tag
                AND member.season_id = requested_season_id
                AND member.player_tag = entry.player_tag
        );

    RETURN jsonb_build_object(
        'seeded', seeded,
        'unmatched', unmatched,
        'rollCallAt', roll_call_taken_at
    );
END;
$$;

COMMENT ON FUNCTION public.seed_cwl_roll_call(text, text) IS
    'Seeds member_availability from the pre-season roll call for a season''s month. Idempotent; never overwrites existing availability. Returns the seeded count, the tags that said yes but are not in the CWL group, and when the roll call was taken (#96).';

REVOKE ALL ON FUNCTION public.seed_cwl_roll_call(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.seed_cwl_roll_call(text, text) TO authenticated;
