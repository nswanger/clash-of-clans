-- The in-game checklist locked in #21 is derived as `saved plan − baseline`,
-- where the baseline is what the game is known to hold. `cwl_daily_lineup_plans`
-- stores the plan; nothing stored what has actually been applied in game, so
-- the checklist could only live in page state and was lost on reload.
--
-- Server-side rather than device-local: a half-applied change set is a fact
-- about the clan's war, not about one phone. A co-leader who applied the swaps
-- should not leave someone else redoing them, and the checklist exists precisely
-- to survive an app switch on a phone whose backgrounded tab can be evicted.
--
-- The baseline is stored as a base member set plus an ordered list of applied
-- changes rather than as one resolved set. The changes record physical acts, so
-- they are deliberately not keyed to a plan revision: a swap made in Clash stays
-- true no matter what the plan says afterwards, which is what makes a reverted
-- change reappear as a fresh instruction in the other direction instead of
-- silently cancelling out. Keeping the acts also makes undoing any row — not
-- only the last — a deletion rather than an inversion.
CREATE TABLE public.cwl_applied_lineup_baselines (
    clan_tag text NOT NULL,
    season_id text NOT NULL,
    war_day smallint NOT NULL CHECK (war_day BETWEEN 1 AND 7),
    revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
    base_source text NOT NULL CHECK (base_source IN ('plan', 'observed', 'confirmed')),
    base_recorded_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    PRIMARY KEY (clan_tag, season_id, war_day),
    FOREIGN KEY (clan_tag, season_id)
        REFERENCES public.cwl_seasons(clan_tag, season_id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT
);

-- Membership only, and no position: order changes are absent from the checklist
-- by design, because the game orders by base weight and a move here transcribes
-- what Clash already shows rather than instructing anything.
--
-- No foreign key to `cwl_members`. The base is written from an observed war
-- roster during collection, and a war member the season roster has not caught up
-- with must not abort the collection transaction. The applied record also has to
-- stay true when the roster changes underneath it.
CREATE TABLE public.cwl_applied_lineup_base_members (
    clan_tag text NOT NULL,
    season_id text NOT NULL,
    war_day smallint NOT NULL,
    player_tag text NOT NULL CHECK (btrim(player_tag) <> ''),
    PRIMARY KEY (clan_tag, season_id, war_day, player_tag),
    FOREIGN KEY (clan_tag, season_id, war_day)
        REFERENCES public.cwl_applied_lineup_baselines(clan_tag, season_id, war_day)
        ON UPDATE RESTRICT
        ON DELETE CASCADE
);

-- One row per game action a leader confirmed making: a swap is a single row with
-- both halves, matching the single check control the checklist gives it.
CREATE TABLE public.cwl_applied_lineup_changes (
    clan_tag text NOT NULL,
    season_id text NOT NULL,
    war_day smallint NOT NULL,
    change_sequence integer NOT NULL CHECK (change_sequence > 0),
    removed_player_tag text CHECK (removed_player_tag IS NULL OR btrim(removed_player_tag) <> ''),
    added_player_tag text CHECK (added_player_tag IS NULL OR btrim(added_player_tag) <> ''),
    applied_at timestamptz NOT NULL DEFAULT now(),
    applied_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    PRIMARY KEY (clan_tag, season_id, war_day, change_sequence),
    CHECK (removed_player_tag IS NOT NULL OR added_player_tag IS NOT NULL),
    CHECK (removed_player_tag IS DISTINCT FROM added_player_tag),
    FOREIGN KEY (clan_tag, season_id, war_day)
        REFERENCES public.cwl_applied_lineup_baselines(clan_tag, season_id, war_day)
        ON UPDATE RESTRICT
        ON DELETE CASCADE
);

CREATE INDEX audit_events_cwl_applied_lineup_idx
    ON public.audit_events (entity_type, entity_id, occurred_at DESC)
    WHERE entity_type = 'cwl_applied_lineup';

ALTER TABLE public.cwl_applied_lineup_baselines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cwl_applied_lineup_base_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cwl_applied_lineup_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Leaders read applied lineup baselines"
    ON public.cwl_applied_lineup_baselines FOR SELECT TO authenticated
    USING (public.is_leader());

CREATE POLICY "Leaders read applied lineup base members"
    ON public.cwl_applied_lineup_base_members FOR SELECT TO authenticated
    USING (public.is_leader());

CREATE POLICY "Leaders read applied lineup changes"
    ON public.cwl_applied_lineup_changes FOR SELECT TO authenticated
    USING (public.is_leader());

GRANT SELECT ON
    public.cwl_applied_lineup_baselines,
    public.cwl_applied_lineup_base_members,
    public.cwl_applied_lineup_changes
    TO authenticated;

COMMENT ON TABLE public.cwl_applied_lineup_baselines IS
    'What the game is known to hold for one CWL war day; the in-game checklist is the saved plan minus this.';
COMMENT ON COLUMN public.cwl_applied_lineup_baselines.base_source IS
    'Provenance of the base member set: observed roster, assumed from the plan, or confirmed check-offs folded in.';
COMMENT ON COLUMN public.cwl_applied_lineup_baselines.revision IS
    'Advances on every baseline mutation so a client can tell the baseline moved under an open checklist.';
COMMENT ON TABLE public.cwl_applied_lineup_changes IS
    'Ordered record of membership changes a leader confirmed making in game, replayed over the base member set.';

CREATE OR REPLACE FUNCTION public.cwl_applied_lineup_baseline_tags(
    requested_clan_tag text,
    requested_season_id text,
    requested_war_day smallint
)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    baseline_tags text[];
    applied_change public.cwl_applied_lineup_changes%ROWTYPE;
BEGIN
    SELECT COALESCE(array_agg(base_member.player_tag ORDER BY base_member.player_tag), ARRAY[]::text[])
    INTO baseline_tags
    FROM public.cwl_applied_lineup_base_members AS base_member
    WHERE base_member.clan_tag = requested_clan_tag
        AND base_member.season_id = requested_season_id
        AND base_member.war_day = requested_war_day;

    FOR applied_change IN
        SELECT applied.*
        FROM public.cwl_applied_lineup_changes AS applied
        WHERE applied.clan_tag = requested_clan_tag
            AND applied.season_id = requested_season_id
            AND applied.war_day = requested_war_day
        ORDER BY applied.change_sequence
    LOOP
        -- Replay tolerates halves it cannot carry out. Any recorded act can be
        -- undone, not only the most recent one, so a later change may name a
        -- member an undone change had moved; ignoring the impossible half keeps
        -- the surviving act's effect instead of failing the whole replay.
        IF applied_change.removed_player_tag IS NOT NULL THEN
            baseline_tags := array_remove(baseline_tags, applied_change.removed_player_tag);
        END IF;
        IF applied_change.added_player_tag IS NOT NULL
            AND NOT (applied_change.added_player_tag = ANY (baseline_tags))
        THEN
            baseline_tags := baseline_tags || applied_change.added_player_tag;
        END IF;
    END LOOP;

    -- The baseline is a set; the checklist takes its order from the plan.
    -- Sorting keeps the snapshot stable across replays of the same acts.
    SELECT COALESCE(array_agg(tag ORDER BY tag), ARRAY[]::text[])
    INTO baseline_tags
    FROM unnest(baseline_tags) AS resolved(tag);

    RETURN baseline_tags;
END;
$$;

CREATE OR REPLACE FUNCTION public.cwl_applied_lineup_snapshot(
    requested_baseline public.cwl_applied_lineup_baselines
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT jsonb_build_object(
        'clanTag', requested_baseline.clan_tag,
        'seasonId', requested_baseline.season_id,
        'warDay', requested_baseline.war_day,
        'revision', requested_baseline.revision,
        'baseSource', requested_baseline.base_source,
        'baseRecordedAt', requested_baseline.base_recorded_at,
        'updatedAt', requested_baseline.updated_at,
        'updatedBy', requested_baseline.updated_by,
        'basePlayerTags', COALESCE(
            (
                SELECT jsonb_agg(base_member.player_tag ORDER BY base_member.player_tag)
                FROM public.cwl_applied_lineup_base_members AS base_member
                WHERE base_member.clan_tag = requested_baseline.clan_tag
                    AND base_member.season_id = requested_baseline.season_id
                    AND base_member.war_day = requested_baseline.war_day
            ),
            '[]'::jsonb
        ),
        'appliedChanges', COALESCE(
            (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'changeSequence', applied.change_sequence,
                        'removedPlayerTag', applied.removed_player_tag,
                        'addedPlayerTag', applied.added_player_tag,
                        'appliedAt', applied.applied_at,
                        'appliedBy', applied.applied_by
                    )
                    ORDER BY applied.change_sequence
                )
                FROM public.cwl_applied_lineup_changes AS applied
                WHERE applied.clan_tag = requested_baseline.clan_tag
                    AND applied.season_id = requested_baseline.season_id
                    AND applied.war_day = requested_baseline.war_day
            ),
            '[]'::jsonb
        ),
        'playerTags', to_jsonb(
            public.cwl_applied_lineup_baseline_tags(
                requested_baseline.clan_tag,
                requested_baseline.season_id,
                requested_baseline.war_day
            )
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.ensure_cwl_applied_lineup(
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
    current_baseline public.cwl_applied_lineup_baselines%ROWTYPE;
    seed_source text;
    seed_tags text[];
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

    SELECT baseline.*
    INTO current_baseline
    FROM public.cwl_applied_lineup_baselines AS baseline
    WHERE baseline.clan_tag = requested_clan_tag
        AND baseline.season_id = requested_season_id
        AND baseline.war_day = requested_war_day;

    IF FOUND THEN
        RETURN public.cwl_applied_lineup_snapshot(current_baseline);
    END IF;

    -- Observation is ground truth, so a day whose war roster has already been
    -- collected starts from it. Otherwise the plan is the only account of what
    -- the game holds; seeding from it says "nothing to do yet" rather than
    -- opening with a checklist instructing the leader to add the whole lineup,
    -- and `base_source` keeps that assumption visible.
    SELECT array_agg(assignment.player_tag ORDER BY assignment.player_tag)
    INTO seed_tags
    FROM public.cwl_wars AS war
    JOIN public.cwl_war_members AS assignment ON assignment.war_tag = war.war_tag
    WHERE war.clan_tag = requested_clan_tag
        AND war.season_id = requested_season_id
        AND war.war_day = requested_war_day;

    IF seed_tags IS NOT NULL THEN
        seed_source := 'observed';
    ELSE
        seed_source := 'plan';
        SELECT COALESCE(array_agg(plan_member.player_tag ORDER BY plan_member.lineup_position), ARRAY[]::text[])
        INTO seed_tags
        FROM public.cwl_daily_lineup_plan_members AS plan_member
        WHERE plan_member.clan_tag = requested_clan_tag
            AND plan_member.season_id = requested_season_id
            AND plan_member.war_day = requested_war_day;
    END IF;

    INSERT INTO public.cwl_applied_lineup_baselines (
        clan_tag,
        season_id,
        war_day,
        base_source,
        created_by,
        updated_by
    )
    VALUES (
        requested_clan_tag,
        requested_season_id,
        requested_war_day,
        seed_source,
        current_user_id,
        current_user_id
    )
    ON CONFLICT (clan_tag, season_id, war_day) DO NOTHING
    RETURNING * INTO current_baseline;

    IF NOT FOUND THEN
        SELECT baseline.*
        INTO current_baseline
        FROM public.cwl_applied_lineup_baselines AS baseline
        WHERE baseline.clan_tag = requested_clan_tag
            AND baseline.season_id = requested_season_id
            AND baseline.war_day = requested_war_day;
        RETURN public.cwl_applied_lineup_snapshot(current_baseline);
    END IF;

    INSERT INTO public.cwl_applied_lineup_base_members (clan_tag, season_id, war_day, player_tag)
    SELECT requested_clan_tag, requested_season_id, requested_war_day, seed.player_tag
    FROM unnest(seed_tags) AS seed(player_tag);

    INSERT INTO public.audit_events (
        actor_id,
        event_type,
        entity_type,
        entity_id,
        event_data
    )
    VALUES (
        current_user_id,
        'applied_lineup_initialized',
        'cwl_applied_lineup',
        format('%s:%s:%s', requested_clan_tag, requested_season_id, requested_war_day),
        jsonb_build_object(
            'revision', current_baseline.revision,
            'baseSource', seed_source,
            'memberCount', COALESCE(array_length(seed_tags, 1), 0)
        )
    );

    RETURN public.cwl_applied_lineup_snapshot(current_baseline);
END;
$$;

-- The daily lineup lock is deliberately not consulted here. It guards edits to
-- the plan of record; a check-off reports something that already happened in
-- Clash, and a locked day is exactly when a leader is executing the list.
CREATE OR REPLACE FUNCTION public.record_cwl_applied_lineup_change(
    requested_clan_tag text,
    requested_season_id text,
    requested_war_day smallint,
    removed_player_tag text,
    added_player_tag text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    current_user_id uuid := auth.uid();
    current_baseline public.cwl_applied_lineup_baselines%ROWTYPE;
    removed_tag text := nullif(btrim(removed_player_tag), '');
    added_tag text := nullif(btrim(added_player_tag), '');
    baseline_tags text[];
    season_war_size smallint;
    resulting_size integer;
    next_sequence integer;
BEGIN
    IF NOT public.is_leader() THEN
        RAISE EXCEPTION 'Leader access required' USING ERRCODE = '42501';
    END IF;
    IF removed_tag IS NULL AND added_tag IS NULL THEN
        RAISE EXCEPTION 'An applied change must remove or add a member';
    END IF;
    IF removed_tag = added_tag THEN
        RAISE EXCEPTION 'An applied change cannot remove and add the same member';
    END IF;

    PERFORM public.ensure_cwl_applied_lineup(
        requested_clan_tag,
        requested_season_id,
        requested_war_day
    );

    SELECT baseline.*
    INTO current_baseline
    FROM public.cwl_applied_lineup_baselines AS baseline
    WHERE baseline.clan_tag = requested_clan_tag
        AND baseline.season_id = requested_season_id
        AND baseline.war_day = requested_war_day
    FOR UPDATE;

    baseline_tags := public.cwl_applied_lineup_baseline_tags(
        requested_clan_tag,
        requested_season_id,
        requested_war_day
    );

    -- A check-off is a tap on a phone that may be retried after a dropped
    -- response. When the same act is already recorded and already reflected,
    -- the second call is that retry, not a second physical change.
    IF (removed_tag IS NULL OR NOT (removed_tag = ANY (baseline_tags)))
        AND (added_tag IS NULL OR added_tag = ANY (baseline_tags))
        AND EXISTS (
            SELECT 1
            FROM public.cwl_applied_lineup_changes AS applied
            WHERE applied.clan_tag = requested_clan_tag
                AND applied.season_id = requested_season_id
                AND applied.war_day = requested_war_day
                AND applied.removed_player_tag IS NOT DISTINCT FROM removed_tag
                AND applied.added_player_tag IS NOT DISTINCT FROM added_tag
        )
    THEN
        RETURN public.cwl_applied_lineup_snapshot(current_baseline);
    END IF;

    IF removed_tag IS NOT NULL AND NOT (removed_tag = ANY (baseline_tags)) THEN
        RAISE EXCEPTION 'Applied change removes a member the game is not known to hold';
    END IF;
    IF added_tag IS NOT NULL AND added_tag = ANY (baseline_tags) THEN
        RAISE EXCEPTION 'Applied change adds a member the game already holds';
    END IF;
    IF added_tag IS NOT NULL AND NOT EXISTS (
        SELECT 1
        FROM public.cwl_members AS member
        WHERE member.clan_tag = requested_clan_tag
            AND member.season_id = requested_season_id
            AND member.player_tag = added_tag
    ) THEN
        RAISE EXCEPTION 'Applied change adds a member outside the season roster';
    END IF;

    SELECT season.war_size
    INTO season_war_size
    FROM public.cwl_seasons AS season
    WHERE season.clan_tag = requested_clan_tag
        AND season.season_id = requested_season_id;

    -- At war size the game refuses an add before a remove, so a lineup over war
    -- size is a check-off that cannot describe anything that happened in Clash.
    resulting_size := COALESCE(array_length(baseline_tags, 1), 0)
        - (CASE WHEN removed_tag IS NULL THEN 0 ELSE 1 END)
        + (CASE WHEN added_tag IS NULL THEN 0 ELSE 1 END);
    IF resulting_size > season_war_size THEN
        RAISE EXCEPTION 'The game cannot hold more than the season war size';
    END IF;

    SELECT COALESCE(max(applied.change_sequence), 0) + 1
    INTO next_sequence
    FROM public.cwl_applied_lineup_changes AS applied
    WHERE applied.clan_tag = requested_clan_tag
        AND applied.season_id = requested_season_id
        AND applied.war_day = requested_war_day;

    INSERT INTO public.cwl_applied_lineup_changes (
        clan_tag,
        season_id,
        war_day,
        change_sequence,
        removed_player_tag,
        added_player_tag,
        applied_by
    )
    VALUES (
        requested_clan_tag,
        requested_season_id,
        requested_war_day,
        next_sequence,
        removed_tag,
        added_tag,
        current_user_id
    );

    UPDATE public.cwl_applied_lineup_baselines AS baseline
    SET
        revision = baseline.revision + 1,
        updated_at = now(),
        updated_by = current_user_id
    WHERE baseline.clan_tag = requested_clan_tag
        AND baseline.season_id = requested_season_id
        AND baseline.war_day = requested_war_day
    RETURNING baseline.* INTO current_baseline;

    INSERT INTO public.audit_events (
        actor_id,
        event_type,
        entity_type,
        entity_id,
        event_data
    )
    VALUES (
        current_user_id,
        'applied_lineup_change_recorded',
        'cwl_applied_lineup',
        format('%s:%s:%s', requested_clan_tag, requested_season_id, requested_war_day),
        jsonb_build_object(
            'revision', current_baseline.revision,
            'changeSequence', next_sequence,
            'removedPlayerTag', removed_tag,
            'addedPlayerTag', added_tag
        )
    );

    RETURN public.cwl_applied_lineup_snapshot(current_baseline);
END;
$$;

-- Undo is never refused. Removing an earlier act can leave a later act standing
-- on its own and the resulting baseline briefly over war size — a leader saying
-- "I removed nobody but I added someone" describes something the game would not
-- allow, which is a claim to correct rather than a claim to trap them in. The
-- surface reads it as one more removal to carry out, and observation settles it.
CREATE OR REPLACE FUNCTION public.undo_cwl_applied_lineup_change(
    requested_clan_tag text,
    requested_season_id text,
    requested_war_day smallint,
    requested_change_sequence integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    current_user_id uuid := auth.uid();
    current_baseline public.cwl_applied_lineup_baselines%ROWTYPE;
    undone_change public.cwl_applied_lineup_changes%ROWTYPE;
BEGIN
    IF NOT public.is_leader() THEN
        RAISE EXCEPTION 'Leader access required' USING ERRCODE = '42501';
    END IF;

    SELECT baseline.*
    INTO current_baseline
    FROM public.cwl_applied_lineup_baselines AS baseline
    WHERE baseline.clan_tag = requested_clan_tag
        AND baseline.season_id = requested_season_id
        AND baseline.war_day = requested_war_day
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Applied lineup baseline is not initialized';
    END IF;

    DELETE FROM public.cwl_applied_lineup_changes AS applied
    WHERE applied.clan_tag = requested_clan_tag
        AND applied.season_id = requested_season_id
        AND applied.war_day = requested_war_day
        AND applied.change_sequence = requested_change_sequence
    RETURNING applied.* INTO undone_change;

    -- Undoing a change that is already gone is the same retry case as recording
    -- one twice: the caller's intent is already the stored state.
    IF NOT FOUND THEN
        RETURN public.cwl_applied_lineup_snapshot(current_baseline);
    END IF;

    UPDATE public.cwl_applied_lineup_baselines AS baseline
    SET
        revision = baseline.revision + 1,
        updated_at = now(),
        updated_by = current_user_id
    WHERE baseline.clan_tag = requested_clan_tag
        AND baseline.season_id = requested_season_id
        AND baseline.war_day = requested_war_day
    RETURNING baseline.* INTO current_baseline;

    INSERT INTO public.audit_events (
        actor_id,
        event_type,
        entity_type,
        entity_id,
        event_data
    )
    VALUES (
        current_user_id,
        'applied_lineup_change_undone',
        'cwl_applied_lineup',
        format('%s:%s:%s', requested_clan_tag, requested_season_id, requested_war_day),
        jsonb_build_object(
            'revision', current_baseline.revision,
            'changeSequence', undone_change.change_sequence,
            'removedPlayerTag', undone_change.removed_player_tag,
            'addedPlayerTag', undone_change.added_player_tag
        )
    );

    RETURN public.cwl_applied_lineup_snapshot(current_baseline);
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_cwl_applied_lineup_changes(
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
    current_baseline public.cwl_applied_lineup_baselines%ROWTYPE;
    baseline_tags text[];
    cleared_count integer;
BEGIN
    IF NOT public.is_leader() THEN
        RAISE EXCEPTION 'Leader access required' USING ERRCODE = '42501';
    END IF;

    SELECT baseline.*
    INTO current_baseline
    FROM public.cwl_applied_lineup_baselines AS baseline
    WHERE baseline.clan_tag = requested_clan_tag
        AND baseline.season_id = requested_season_id
        AND baseline.war_day = requested_war_day
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Applied lineup baseline is not initialized';
    END IF;

    SELECT count(*)::integer
    INTO cleared_count
    FROM public.cwl_applied_lineup_changes AS applied
    WHERE applied.clan_tag = requested_clan_tag
        AND applied.season_id = requested_season_id
        AND applied.war_day = requested_war_day;

    IF cleared_count = 0 THEN
        RETURN public.cwl_applied_lineup_snapshot(current_baseline);
    END IF;

    -- Folding leaves the same effective baseline with an empty checklist
    -- history: the acts are settled, so they stop being rows to undo.
    baseline_tags := public.cwl_applied_lineup_baseline_tags(
        requested_clan_tag,
        requested_season_id,
        requested_war_day
    );

    DELETE FROM public.cwl_applied_lineup_changes AS applied
    WHERE applied.clan_tag = requested_clan_tag
        AND applied.season_id = requested_season_id
        AND applied.war_day = requested_war_day;

    DELETE FROM public.cwl_applied_lineup_base_members AS base_member
    WHERE base_member.clan_tag = requested_clan_tag
        AND base_member.season_id = requested_season_id
        AND base_member.war_day = requested_war_day;

    INSERT INTO public.cwl_applied_lineup_base_members (clan_tag, season_id, war_day, player_tag)
    SELECT requested_clan_tag, requested_season_id, requested_war_day, folded.player_tag
    FROM unnest(baseline_tags) AS folded(player_tag);

    UPDATE public.cwl_applied_lineup_baselines AS baseline
    SET
        revision = baseline.revision + 1,
        base_source = 'confirmed',
        base_recorded_at = now(),
        updated_at = now(),
        updated_by = current_user_id
    WHERE baseline.clan_tag = requested_clan_tag
        AND baseline.season_id = requested_season_id
        AND baseline.war_day = requested_war_day
    RETURNING baseline.* INTO current_baseline;

    INSERT INTO public.audit_events (
        actor_id,
        event_type,
        entity_type,
        entity_id,
        event_data
    )
    VALUES (
        current_user_id,
        'applied_lineup_changes_cleared',
        'cwl_applied_lineup',
        format('%s:%s:%s', requested_clan_tag, requested_season_id, requested_war_day),
        jsonb_build_object(
            'revision', current_baseline.revision,
            'clearedChangeCount', cleared_count,
            'memberCount', COALESCE(array_length(baseline_tags, 1), 0)
        )
    );

    RETURN public.cwl_applied_lineup_snapshot(current_baseline);
END;
$$;

-- Observation replaces the baseline wholesale rather than ticking items off it:
-- the war roster the API reports is what the game holds, and a check-off is only
-- ever a stand-in for evidence that had not arrived yet.
--
-- This is a trigger rather than a step inside `apply_cwl_war_unit` because the
-- collector also upserts `cwl_war_members` directly through PostgREST; a trigger
-- covers both writers. It reads the war's current roster rather than the
-- transition rows, so the delete-and-reinsert inside `apply_cwl_war_unit`
-- resolves to the final state. An empty roster is not evidence and leaves the
-- baseline alone, which is also why the delete half of that pair is not fired on.
CREATE OR REPLACE FUNCTION public.sync_cwl_applied_lineup_from_observation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    observed_war record;
    current_baseline public.cwl_applied_lineup_baselines%ROWTYPE;
    observed_tags text[];
BEGIN
    FOR observed_war IN
        SELECT DISTINCT war.clan_tag, war.season_id, war.war_day
        FROM (SELECT DISTINCT observed_member.war_tag FROM observed_members AS observed_member) AS touched
        JOIN public.cwl_wars AS war ON war.war_tag = touched.war_tag
        WHERE war.war_day BETWEEN 1 AND 7
    LOOP
        -- Only days a leader has already opened carry a baseline. A day without
        -- one seeds from this same observation when it is first opened, so
        -- creating rows here would only add collection-time writes.
        SELECT baseline.*
        INTO current_baseline
        FROM public.cwl_applied_lineup_baselines AS baseline
        WHERE baseline.clan_tag = observed_war.clan_tag
            AND baseline.season_id = observed_war.season_id
            AND baseline.war_day = observed_war.war_day
        FOR UPDATE;
        CONTINUE WHEN NOT FOUND;

        SELECT array_agg(assignment.player_tag ORDER BY assignment.player_tag)
        INTO observed_tags
        FROM public.cwl_wars AS war
        JOIN public.cwl_war_members AS assignment ON assignment.war_tag = war.war_tag
        WHERE war.clan_tag = observed_war.clan_tag
            AND war.season_id = observed_war.season_id
            AND war.war_day = observed_war.war_day;
        CONTINUE WHEN observed_tags IS NULL;

        CONTINUE WHEN current_baseline.base_source = 'observed'
            AND observed_tags = public.cwl_applied_lineup_baseline_tags(
                observed_war.clan_tag,
                observed_war.season_id,
                observed_war.war_day
            )
            AND NOT EXISTS (
                SELECT 1
                FROM public.cwl_applied_lineup_changes AS applied
                WHERE applied.clan_tag = observed_war.clan_tag
                    AND applied.season_id = observed_war.season_id
                    AND applied.war_day = observed_war.war_day
            );

        DELETE FROM public.cwl_applied_lineup_changes AS applied
        WHERE applied.clan_tag = observed_war.clan_tag
            AND applied.season_id = observed_war.season_id
            AND applied.war_day = observed_war.war_day;

        DELETE FROM public.cwl_applied_lineup_base_members AS base_member
        WHERE base_member.clan_tag = observed_war.clan_tag
            AND base_member.season_id = observed_war.season_id
            AND base_member.war_day = observed_war.war_day;

        INSERT INTO public.cwl_applied_lineup_base_members (clan_tag, season_id, war_day, player_tag)
        SELECT observed_war.clan_tag, observed_war.season_id, observed_war.war_day, observed.player_tag
        FROM unnest(observed_tags) AS observed(player_tag);

        UPDATE public.cwl_applied_lineup_baselines AS baseline
        SET
            revision = baseline.revision + 1,
            base_source = 'observed',
            base_recorded_at = now(),
            updated_at = now(),
            updated_by = NULL
        WHERE baseline.clan_tag = observed_war.clan_tag
            AND baseline.season_id = observed_war.season_id
            AND baseline.war_day = observed_war.war_day
        RETURNING baseline.* INTO current_baseline;

        INSERT INTO public.audit_events (
            actor_id,
            event_type,
            entity_type,
            entity_id,
            event_data
        )
        VALUES (
            NULL,
            'applied_lineup_observed',
            'cwl_applied_lineup',
            format('%s:%s:%s', observed_war.clan_tag, observed_war.season_id, observed_war.war_day),
            jsonb_build_object(
                'revision', current_baseline.revision,
                'memberCount', COALESCE(array_length(observed_tags, 1), 0)
            )
        );
    END LOOP;

    RETURN NULL;
END;
$$;

-- Two triggers rather than one `INSERT OR UPDATE`: a transition table can only
-- be attached to a single-event trigger. `apply_cwl_war_unit` reaches the table
-- by insert and the collector's PostgREST upsert by either.
CREATE TRIGGER cwl_war_members_insert_sync_applied_lineup
    AFTER INSERT ON public.cwl_war_members
    REFERENCING NEW TABLE AS observed_members
    FOR EACH STATEMENT
    EXECUTE FUNCTION public.sync_cwl_applied_lineup_from_observation();

CREATE TRIGGER cwl_war_members_update_sync_applied_lineup
    AFTER UPDATE ON public.cwl_war_members
    REFERENCING NEW TABLE AS observed_members
    FOR EACH STATEMENT
    EXECUTE FUNCTION public.sync_cwl_applied_lineup_from_observation();

REVOKE ALL ON FUNCTION public.cwl_applied_lineup_baseline_tags(text, text, smallint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cwl_applied_lineup_snapshot(public.cwl_applied_lineup_baselines) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_cwl_applied_lineup(text, text, smallint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_cwl_applied_lineup_change(text, text, smallint, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.undo_cwl_applied_lineup_change(text, text, smallint, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.clear_cwl_applied_lineup_changes(text, text, smallint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_cwl_applied_lineup_from_observation() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.ensure_cwl_applied_lineup(text, text, smallint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_cwl_applied_lineup_change(text, text, smallint, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.undo_cwl_applied_lineup_change(text, text, smallint, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_cwl_applied_lineup_changes(text, text, smallint) TO authenticated;

COMMENT ON FUNCTION public.ensure_cwl_applied_lineup(text, text, smallint) IS
    'Creates the applied-lineup baseline once, from the observed war roster when it exists and otherwise from the plan.';
COMMENT ON FUNCTION public.record_cwl_applied_lineup_change(text, text, smallint, text, text) IS
    'Records one membership change a leader confirmed making in game; repeating a recorded change is treated as a retry.';
COMMENT ON FUNCTION public.undo_cwl_applied_lineup_change(text, text, smallint, integer) IS
    'Removes one recorded change so the instruction reappears; any change can be undone, not only the most recent.';
COMMENT ON FUNCTION public.clear_cwl_applied_lineup_changes(text, text, smallint) IS
    'Folds confirmed changes into the base member set, leaving the same baseline with no checklist history.';
COMMENT ON FUNCTION public.sync_cwl_applied_lineup_from_observation() IS
    'Replaces an existing baseline with the observed war roster, because observation is ground truth rather than a tick.';
