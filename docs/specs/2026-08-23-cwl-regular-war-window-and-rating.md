# CWL rating reads a bounded regular-war window

Spec for [#89](https://github.com/nswanger/clash-of-clans/issues/89). Decisions
settled with Nick in a grilling session on 2026-08-23; every design choice below
carries the reasoning that produced it, because several of them overturn what
the issue body says.

## Why the issue body cannot be implemented as written

Four premises in #89 are stale or wrong. They are recorded here rather than
corrected in the ticket, because the ticket is a request and this is the answer.

1. **The 0.6/0.4 blend does not exist.** It was written in
   `202608090001_cwl_history_ratings.sql:161` and removed by
   `202608090002_separate_regular_activity.sql`, which replaced `overall_rating`
   with reliability alone. That was ADR 0001 being applied, not a regression:
   regular-war history is "a separate activity/performance gauge ... exposed
   through evidence filters rather than silently folded into CWL lineup
   recommendations." The all-time join therefore reaches no rating today, and
   this work *reintroduces* a blend rather than repairing one.
2. **The review surface never reads `cwl_member_overall_rating`.**
   `loadCwlReviewSeason` does not query it and `rankReviewMembers` ranks on the
   season record only. Its regular-war panel comes from
   `loadWarActivityWindow(client, clanTag, 30)` -- the windowed function,
   anchored to `now()`. That call, not the view, is what makes a previous
   season's review show the last thirty days beside a six-month-old season.
3. **`cwl_members` is the CWL signup roster, not the clan roster.**
   `normalizeGroup` upserts one row per `clan.members` entry from the
   `league_group` response. The "22 of 49" in the issue's probe comment compares
   against `member_daily_snapshots` (the clan), which is the wrong denominator
   for a surface driven by `cwl_members`.
4. **Reliability is NULL before a war day ends, not zero.**
   `cwl_completed_missed_attacks` filters `where assignment.war_state =
   'warEnded'`, so a member has no rows at all until a day ends,
   `assigned_opportunities` is 0, and `cwl_member_reliability` returns NULL with
   `limited_confidence`. `overall_rating` is NULL in turn. **While the leader
   builds the first lineup of a season, no member has a rating and the
   recommender's `overall_rating` tie-break is inert** -- every candidate scores
   -1. The original blend had this hole too; it only blended when reliability
   was already present.

Premise 4 is the most valuable defect in the ticket and the issue does not
mention it.

## What is actually wrong

- **The gauge is unanchored in time.** Both the all-time views feeding
  `cwl_member_overall_rating` and the `now()`-anchored windowed call feeding the
  review panel answer "how active is this member today", not "going into that
  CWL".
- **Non-participation is indistinguishable from no data.**
  `regular_war_member_activity` INNER JOINs `regular_war_members`, so a member
  who appeared in no war has no row and arrives NULL. A member who sat out every
  war the clan fought is exactly who the gauge exists to surface.
- **The lineup workspace mixes periods within one member.**
  `operations.ts:653-659` takes `regularWarsObserved` / `regularWarsParticipated`
  from the all-time view while `regularActivityScore` / `performanceScore` /
  `starsPerAttack` prefer the windowed row. "Joined 3 of 5" and the scores beside
  it can describe different periods.
- **There is no rating when the leader most needs one** (premise 4).

## Decisions

| # | Decision | Reasoning |
|---|---|---|
| D1 | Reopen ADR 0001's separation clause via a new ADR superseding 0001 **in full** | 0001 is cited by number from code comments and from ADR 0008/0010; a partially superseded record makes every citation ambiguous. The three surviving clauses are restated in the new record. |
| D2 | Regular-war history folds back into the rating, unconditionally -- not gated on `war_size` | One consistent rule. A war-size-conditional definition means the same member rates differently across seasons for reasons unrelated to them, which reads as a bug on the surface a year later. |
| D3 | Window upper bound: `min(preparation_start_time)` over the season's `cwl_wars`; fallback to the first day of the month from `seasonMonth(season_id)` | A regular war can bleed past the 1st, when CWL can first start, so the true season start is more precise than the month boundary. `min()` degrades to day 2's prep start when day 1's collection was missed, instead of dropping straight to the month floor. The fallback only fires when the season has no timed war at all. |
| D4 | Window lower bound: `max(end_time)` over the **previous** CWL season's `cwl_wars`; fallback to upper bound minus 30 days | "Any war since the last CWL" is the cleaner rule, and CWL and regular wars cannot overlap, so it is structurally free of double-counting. The fallback is needed because a clan's first collected season has no predecessor -- leaving it unbounded would reintroduce the all-time defect on a delay. |
| D5 | Denominator is every attack available across the window's wars, including wars the member sat out | This is the single choice that turns non-participation into a zero rather than a missing row. It is fair because regular-war entry is **self-selected**: the game auto-places signed-up members, so appearing in a war is at the member's own request. `team_size` is therefore not a gate the member does not control. (CWL has no equivalent signup, which is what this app exists to compensate for.) |
| D6 | `regular_score = 100 * (0.7 * opportunity_rate + 0.3 * quality)` | Two named terms, not one number: they answer different questions, a leader should see which one is dragging someone down, and a wrong weighting is re-weighted rather than re-derived. Attendance dominates because consistency across wars is the thing being measured. |
| D7 | `overall_rating = 0.6 * reliability + 0.4 * regular_score` when both exist | 0.4 stops a single early war day (2 attacks) from erasing a month of regular-war evidence. Volume-weighting the two terms was considered and rejected against AGENTS.md's "simple, auditable scoring before clever automation"; revisit if 0.6/0.4 proves too blunt. |
| D8 | When reliability is NULL and the window observed wars, the rating is the regular score alone | This is what makes a rating exist on day 1, when the leader is choosing 30 from 50 with no CWL evidence. Describing it as "a blend with a missing term" would be the same arithmetic dressed as something it is not. |
| D9 | When the window observed no wars, fall back to reliability-only; when neither exists, NULL | AGENTS.md: absence of evidence is never a penalty. `wars_observed = 0` says nothing about anybody. |
| D10 | A member is measured only against wars whose preparation began at least **2 days** after collection first observed them -- but only when that first observation is **later than the clan's own first roster pull** | The clan-change war lockout is real, and a member cannot be faulted for a war that started before they arrived. The gate is not optional: without it, first-observed is collection's start date rather than a join date, and the buffer deletes the war history of every member who predates collection. The existing window test caught exactly this, failing 11 assertions. |
| D11 | `war_preference` is **not** read | Members do not reliably maintain it; the clan has members with no preference who sign up and vice versa. An unmaintained flag is noise, not evidence. |
| D12 | The windowed gauge enumerates the clan roster; the CWL view scopes it by joining `cwl_members` | The function's job is regular-war activity for a clan over a window. Who is in a given CWL is the view's question, and it already drives from `cwl_members`. One definition, callers scope it. |
| D13 | The view exposes a basis, and the panel shows a total plus a breakdown | Two members can both read 80 while meaning different things. `limited_confidence` is the precedent and AGENTS.md requires inferred data to say so. |
| D14 | The review panel's standalone regular-war gauge is **replaced** by the same total-and-breakdown | Otherwise one panel shows the same evidence twice under two definitions -- the drift this ticket is about. |
| D15 | The recommender gets distinct reason codes per basis | Recommendations are persisted and re-read. A day-1 recommendation ranked purely on regular-war history is a materially different claim from a day-5 one, and a single code cannot record which. |

## Design

### The window, per season

For each `(clan_tag, season_id)` in `cwl_seasons`:

```
window_to   = coalesce(
                (select min(preparation_start_time) from cwl_wars
                  where clan_tag = s.clan_tag and season_id = s.season_id
                    and preparation_start_time is not null),
                <first day of seasonMonth(season_id), UTC midnight>
              )

window_from = coalesce(
                (select max(w.end_time) from cwl_wars w
                  where w.clan_tag = s.clan_tag
                    and w.season_id = <greatest season_id < s.season_id for this clan>
                    and w.end_time is not null),
                window_to - interval '30 days'
              )
```

A regular war falls in the window when `state <> 'preparation'`, `end_time is
not null`, and `window_from < end_time <= window_to`. The `end_time <=
window_to` bound makes the existing "ended or time-finalized" guard redundant
for any season already begun, but the `state` guard stays: a war in preparation
has no participation to measure.

Worked against production, where `regular_wars` begins 2026-08-15 and the only
collected CWL season is `2026-08`:

- **`2026-08`** -- no predecessor, so `window_from` is the 30-day fallback ending
  at the season's prep start (~08-01). Contains **zero** regular wars, because
  none had been collected yet. Correctly reports a coverage gap (D9) rather than
  rating anybody on nothing. No retroactive fix is possible and none is claimed.
- **`2026-09`** -- `window_from` is the 2026-08 CWL's last war end (~08-09),
  `window_to` is September's prep start. Captures every regular war collected so
  far. This is the first season the feature actually serves.

### Per-member eligibility (D10)

`first_observed_at(clan_tag, player_tag) = min(observed_on)` over
`member_daily_snapshots`. A window war is eligible for a member when

```
coalesce(war.preparation_start_time, war.end_time) >= first_observed_at + interval '2 days'
```

so `wars_observed` and `available_attacks` are **per member**, not per clan. The
surface must therefore say "3 of 6" from the member's own row rather than from a
clan-wide constant. A member with no snapshot row at all (seen in a war but
never in a roster pull) is treated as eligible for every window war.

### The score

Over a member's eligible window wars:

```
available_attacks = sum(war.attacks_per_member)
attacks_made      = sum(member.attacks_made)
stars             = sum(member.stars)

opportunity_rate  = attacks_made / available_attacks          -- NULL when available_attacks = 0
quality           = stars / (3 * attacks_made)                -- 0 when attacks_made = 0
regular_score     = round(100 * (0.7 * opportunity_rate + 0.3 * quality))
                                                              -- NULL when available_attacks = 0
```

`available_attacks` is `sum(attacks_per_member)` rather than
`count(*) * 2`, because `regular_wars.attacks_per_member` is a real column and
assuming 2 is an assumption with no reason behind it.

`opportunity_rate` is **capped at 1**. Numerator and denominator come from
different tables -- the war's `attacks_per_member` and the member's own
`attacks_made` -- and a war record that disagrees with its member records would
otherwise produce a rating above 100. The existing `regular_war_activity_test`
fixture already contains such a disagreement.

Behaviour against a 6-war window, 2 attacks each:

| | wars | attacks | stars | opportunity | quality | `regular_score` |
|---|---|---|---|---|---|---|
| Showed up, did not attack | 2 | 0/4 | 0 | 0.00 | 0 | **0** |
| One war, perfect, 3-star | 1 | 2/2 | 6 | 0.17 | 1.00 | **42** |
| One war, perfect, 1-star | 1 | 2/2 | 2 | 0.17 | 0.33 | **22** |
| Every war, average 2-star | 6 | 12/12 | 24 | 1.00 | 0.67 | **90** |
| Sat out all six | 0 | 0/12 | 0 | 0.00 | 0 | **0** |

The last row is the point of the ticket: today that member is NULL and
indistinguishable from someone the collector knows nothing about.

### The rating

```
basis = 'blended'          when reliability is not null and regular_score is not null
        'reliability_only' when reliability is not null and regular_score is null
        'regular_only'     when reliability is null     and regular_score is not null
        null               when both are null

overall_rating = blended          -> round(0.6 * 100 * reliability + 0.4 * regular_score)
                 reliability_only -> round(100 * reliability)
                 regular_only     -> regular_score
                 null             -> null
```

### Surfaces

Both panels show the total in the existing `cm-panel-evidence` lede and a
breakdown below it as a `cm-panel-label` plus a `<dl>` -- the pattern
`cwl-review.tsx` already uses for its regular-war group. **No new component and
no new token**, so this raises no finding for `design/components.md`; a tooltip
is explicitly not a component there, which rules out the other obvious home for
a breakdown.

```
Rating basis
  CWL attacks     72
  Regular wars    45
Weighted 60% CWL attacks, 40% regular wars.        <- muted legend, once per panel
```

The weights appear **once, as a legend line**, not repeated on each row (D13, as
refined: a weight that repeats on every row is chrome). The legend line takes
the existing muted caveat style (`cwl-review-freshness` and its lineup
equivalent).

Basis wording:

- `regular_only` -- "No CWL attacks yet this season. Rated on regular-war
  activity since the last CWL."
- `reliability_only` -- "No regular wars observed in the window before this
  season. Rated on this CWL's attack completion."
- `blended` -- the legend line alone.
- `null` -- the existing "No CWL rating yet".

The review panel's "Regular wars - last 30 days" group and its
`REGULAR_WINDOW_DAYS = 30` constant are removed (D14); the window label becomes
the season's own ("since the 2026-08 CWL", or "the 30 days before" when D4's
fallback fired). The label must state which bound was used, because the two
windows are not the same claim.

## Schema

One migration. Applied with `supabase db push` **before** any surface that reads
it ships (AGENTS.md, ADR 0003).

1. **`regular_war_member_activity_between(clan_tag text, from timestamptz, to timestamptz)`**
   -- the aggregation, defined once. Same shape as today's
   `regular_war_member_activity_window` (roster-enumerated via
   `member_daily_snapshots` UNION participants, so sitting out is a zero) plus
   `available_attacks`, `opportunity_rate`, `quality_score`, `regular_score`, and
   per-member eligibility (D10).
2. **`regular_war_member_activity_window(clan_tag text, window_days integer)`**
   -- rewritten as a thin wrapper delegating to `_between(clan, now() -
   window_days, now())`. Its existing signature, column list and callers are
   unchanged, so `member-history.ts` and the members roster need no edit and
   their tests keep passing.
3. **`cwl_season_regular_window`** (view) -- `(clan_tag, season_id, window_from,
   window_to, window_from_basis, window_to_basis)`. The basis columns exist so
   the surface can label the window honestly rather than guessing which branch
   of D3/D4 fired.
4. **`cwl_member_regular_activity`** (view) -- `cwl_members` INNER JOINed (D12)
   to a LATERAL call of `_between` over `cwl_season_regular_window`.
5. **`cwl_member_overall_rating`** -- `CREATE OR REPLACE`, dropping both all-time
   joins for `cwl_member_regular_activity`, adding `regular_score`,
   `rating_basis`, `regular_window_from`, `regular_window_to`.
6. **`get_recommendation_context`** -- the same substitution, so the function and
   the view cannot drift (the ticket's own last open question). Its member facts
   gain `regularScore` and `ratingBasis`; `overallRating` picks up the blend.
   Bump `schemaVersion` 3 -> 4.
7. **`regular_war_member_activity` and `regular_war_clan_history`** -- both lose
   their last callers at step 5/6. Drop them in the same migration if nothing
   else references them; a view kept "just in case" is how the two definitions
   drift apart again. Verify with a grep across `apps/`, `packages/`,
   `supabase/` before dropping.

`security_invoker = true` and the `GRANT SELECT ... TO authenticated` pattern
carry over unchanged on every new object.

**Performance note:** the LATERAL in step 4 calls the aggregation once per
`(clan, season)`. At this scale -- a handful of seasons, at most 50 members --
that is fine, and it buys one definition of the metric instead of two. Revisit
if the seasons list grows long.

## Application changes

- **`apps/web/src/data/operations.ts`** -- `loadCwlLineupWorkspace` drops the
  `regular_war_member_activity` query and the `??` fallbacks at 653-659, reading
  every regular figure from `cwl_member_overall_rating`'s new columns. This is
  the mixed-period defect (in scope per the grilling), and it disappears as a
  consequence rather than as a separate fix. `loadCwlReviewSeason` gains the
  rating columns it does not currently read.
- **`apps/web/src/cwl/cwl-lineup-workspace.tsx`** -- the lede at 325-328 gains
  the basis wording; the breakdown group goes in `cm-panel-body`.
- **`apps/web/src/cwl/cwl-review.tsx`** -- `REGULAR_WINDOW_DAYS` and the
  `loadWarActivityWindow` call are removed along with the standalone gauge; the
  panel gains the same breakdown. The two-load structure stays: the rating must
  not blank the season record if it fails.
- **`packages/domain/src/domain.ts`** -- `regularScore` and `ratingBasis` on the
  member facts schema; two new reason codes in the enum.
- **`packages/recommendations/`** -- `overall_rating` splits into
  `overall_rating_blended` and `overall_rating_regular_only` (D15) with distinct
  explanations. The stale "based on observed current-CWL attack completion"
  string is corrected in **both** `portable-production.ts:125` and
  `explanations.ts:11`, which are duplicates of each other. Rule *order* does not
  change: availability still decides replacement, the rating still only ranks
  substitutes.
- **`apps/web/src/test/e2e-client.ts`** -- the hand-maintained stub models the
  new columns and the new window view. Per AGENTS.md its filters hold only where
  the fixture models the column, so the new `season_id`-scoped window needs a
  real modelled column, not a passthrough. Anything read against the clock stays
  dated from the clock.

## Documentation

- **New ADR superseding 0001 in full** (D1), restating the surviving clauses --
  the evidence rating's definition, bonus priority, and current-war observations
  only -- alongside the new blend, its weights, and the self-selection
  justification for D5. Frontmatter needs `status`, `date`, `deciders`, and
  `supersedes: 0001-cwl-evidence-and-bonus-priority`; `index.json` is
  regenerated by the lint.
- **`design/prototype/cwl-review.html`** -- the review panel's locked
  appearance. Its regular-war group is replaced by the same rating basis the
  surface now shows, so the prototype stays the thing appearance is checked
  against. No new component or token, so no `design/components.md` finding.
- **`docs/product-direction.md` needs no change.** Its "Prioritization rules"
  section ranks *work*, not members; the member ranking rules live in the ADR.
- Code comments citing "ADR 0001" for the separation
  (`cwl-review.tsx:47`, `:277`) repoint to the new number.

## Validation

- `supabase test db` -- pgTAP over the new views. At minimum: a sitter-out with
  `available_attacks > 0` scores 0 and is present as a row; an empty window
  yields NULL and reliability-only; the D3 and D4 fallbacks each fire when their
  primary is absent; a member first observed inside the window is measured only
  against wars beginning 2 days or more after that; `2026-08`-shaped data (no
  predecessor, no window wars) produces a coverage gap and no zeros.
- `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm exec playwright test`.
- `python3 scripts/doc_lint.py --strict` after the ADR.
- `git diff --check`.
- Appearance checked by hand against `design/prototype/` at 375px and 1280px in
  both themes.

## Deliberately not in scope

- The reliability half of the rating, which is already season-scoped.
- Bonus priority and the eight-star rule.
- The members roster's 7-day window and its own gauge, which answer "who stopped
  turning up this week" and are unaffected.
- A true join date. D10 rides on first-observed and improves on its own as
  snapshot history deepens; a real join date is a small follow-up when the data
  can support it.
- Any fairness correction for `team_size` (D5) or for `war_preference` (D11).

## Risks

- **`2026-08` gains nothing.** The only collected season has an empty window and
  will correctly show a coverage gap. The feature is unverifiable against real
  production data until the September CWL. Accepted: it is a property of when
  collection started, not of the design.
- **First-observed is not a join date.** D10's buffer is inert today. Stated in
  the ADR rather than hidden.
- **`get_recommendation_context` bumps its schema version.** Any persisted
  recommendation input at version 3 predates the blend; readers must not assume
  the rating means the same thing across the boundary.
