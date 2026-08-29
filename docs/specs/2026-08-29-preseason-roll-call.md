# The pre-season roll call seeds next month's CWL availability

Decisions settled with Nick in a grilling session on 2026-08-29. No ticket exists
yet; this spec is the request and the answer together, and the issue should be
opened against it rather than the other way round.

The gap: the clan's real availability process runs **before** CWL starts. A
message goes out to clan chat in the last days of the month and everyone who
likes it is available for the upcoming season. On 2026-08-29 that message has
already been sent, the September season does not start until the 1st, and the app
offers nowhere to record the answers. Stand down counts down to a season it can
say nothing about, and the lineup phase still shows August.

## Why availability cannot simply be recorded early

`member_availability` is keyed `(clan_tag, season_id, player_tag)` with a foreign
key to `cwl_members`, which in turn keys to `cwl_seasons`
(`202607110001_core_schema.sql:168`). A season the API has not published has no
row in either table, so there is no row availability can hang from. This is not
an oversight to route around -- it is what keeps availability attached to a real
season -- but it does mean the pre-season answer has to live somewhere else
until the season exists.

## Why the obvious implementation is wrong

The shape this work was first proposed in -- seed a placeholder season and its
members from the most recent roster pull, then reconcile against the CWL endpoint
later -- fails on three counts, all of them verified against the repository
rather than reasoned about:

1. **It requires fabricating two tables of API-derived rows.** A placeholder
   `cwl_seasons` row plus one `cwl_members` row per current member, for a season
   nobody has played, in tables whose contents otherwise come only from
   `normalizeGroup`.
2. **The placeholder silently ends stand down.** `cwl_current_seasons` is
   `distinct on (clan_tag) ... order by season_id desc`
   (`202607110005_derived_views.sql:1`), so `2026-09-01` becomes the current
   season the moment it is inserted. `defaultCwlPhase` returns `"lineup"` for a
   season with no war states -- that is its documented self-clearing path
   (`apps/web/src/cwl/cwl-phase.ts`) -- so inserting the placeholder on 29 August
   drops the leader into an empty, editable day-1 lineup two days early. That is
   ADR 0002's original defect reintroduced from the other end.
3. **The fabricated members are permanent.** `upsertMember` is upsert-only with
   no prune (`apps/collector/src/supabase-collector-repository.ts:111`). Seed 48
   clan members, sign up 30 in game, and the season carries 18 members who were
   never in it -- and `cwl_members` is the denominator for the review surface and
   for `cwl_member_overall_rating`.

The reconciliation script the proposal anticipated is also unnecessary. Once the
league group forms, `cwl_members` **is** the ground truth for who was signed up,
so the comparison is a read at seed time rather than a process that mutates state
without a human.

## Decisions

| # | Decision | Reasoning |
|---|---|---|
| D1 | The roll call is its own staging table keyed `(clan_tag, target_month)`, holding player tags with **no foreign key** into the CWL tables | The only structure that can be written before the season exists. It is also what makes the timing requirement -- record availability before the first API pull of the season -- literally satisfiable rather than approximated. |
| D2 | `target_month` is the month of `nextCwlStart(now)`, not `today + 1 month` | The same arithmetic the countdown on screen is already performing (`apps/web/src/cwl/cwl-countdown.ts:48`), so the roll call is always for the month the timer is pointing at. Recomputing it independently lets the two disagree on the 1st, which is the one day it matters. |
| D3 | The roll call is **not** retained beyond the season it seeds (see the implementation note under the stale rule) | Everything it is wanted for survives the seed. "Said yes, was added, did not attack" is `roll_call_at` joined to `cwl_member_reliability`; the only fact lost is "said yes and never made the group", which is ambiguous evidence -- usually a leader oversight or a full roster, not a member failing. A retained monthly history would be a second historical source answering the question `member_availability` already answers, which ADR 0009 rules out, and would need its own record and a claim on the member panel. |
| D4 | Provenance is an **immutable `roll_call_at timestamptz`** column on `member_availability`, not a `source` enum | `saveAvailability` upserts the row (`apps/web/src/data/operations.ts:1134`), overwriting `status`, `recorded_by` and `recorded_at`. A `source` column would flip to `leader` the first time the member is touched mid-season, destroying the fact being kept. A separate column that the seed writes once and nothing else touches survives every later edit. |
| D5 | A mid-season withdrawal is the existing status flip. No second record, no event type | `roll_call_at` and `status` read together already separate the cases: set + `available` is a live promise, set + `unavailable` is a promise withdrawn, null + `available` is a leader marking someone available with no promise behind it. `recorded_at` is overwritten to the moment of the flip, so the withdrawal date comes free, and `audit_availability_change` (`202607180010_automatic_audit_events.sql:74`) already appends the full sequence. The report reads both columns instead of keying off `roll_call_at` alone. |
| D6 | The seed is a **lazy, idempotent database function invoked on the first authenticated read** of the new season -- not a collector step and not a leader action | Automatic, so the pre-season work is never repeated after signup, which is the whole requirement. Not in the collector, which stays outbound-only and raw and must not write leader-owned decision state. Running under the leader's session gives `recorded_by` an honest actor. There is no late-seed window: nothing reads availability except a surface whose own load triggers the seed, and the day-1 plan does not exist until the workspace is opened (`ensure_cwl_daily_lineup_plan`). |
| D7 | Roll-call entries with no matching `cwl_members` row are reported, never written | The foreign key forbids writing them, and they should not be written anyway. They are named in the seed note so the leader sees who said yes and did not make the group. |
| D8 | Every member starts `unknown`; the leader ticks the yeses | Matches the actual process -- people opt in by liking a message -- and honours AGENTS.md: nobody is presumed available, and absence of an answer is never a penalty. |
| D9 | A roll call whose target month passes without a season landing is **discarded silently** | Only reachable when collection is already broken through the 1st, or the clan skipped CWL. Surfacing it would add a permanent notice to a page whose entire ADR is about restraint, to report a condition with a louder symptom elsewhere. |
| D10 | The surface is `cm-panel` in **both** its documented mountings -- docked above 720px, a sheet behind a control below it -- **stacked beneath the countdown**, never beside it | Not a design choice left open: `design/components.md` lists a modal dialog under what is deliberately not a component. The stacking was settled by building the alternatives: two `cm-columns` layouts were tried and whichever surface took the main column read as what the page was about. Stacked, the countdown stays the largest object and ADR 0002's constraint survives unamended on that point -- and it is the order the phone already had, so there is one arrangement at every width. Desktop is where the roll call is actually done, since the game is on a phone and the ticking happens on a computer, so the docked mounting is the one that matters most. |
| D11 | The default list is **who answered**, with the rest of the clan behind `cm-search` | Fifty rows by default is a roster dump that grows with the clan and is mostly people who did not answer. This is the bench's shape, not a new one: the lineup shows the fifteen who are in and puts the other thirty-five behind a search, because "ranking does the work sorting used to" ([#20](https://github.com/nswanger/clash-of-clans/issues/20)). The first roll call of a month therefore starts empty, which is honest -- nobody has answered -- and matches the work, since likes are read off a phone one name at a time, which is a search rather than a scan. |
| D12 | The list obeys a **ten-row cap** shared across the app, recorded as [ADR 0024](../decisions/0024-design-list-length-and-reveal.md) | Generalised at Nick's request rather than solved locally. A box sized from a fixed row count never resizes under a filter, never needs an inner scrollbar inside a page that already scrolls, and does not grow with the clan. The cap applies to the default list too, not only to searches, which is what makes the box a true constant. A list showing less than everything says so, in the bench's `N of M shown` form. |
| D13 | The term is **Roll call**, entered in `CONTEXT.md` as distinct from *Season availability* | It is a different thing from the availability it feeds -- gathered before the season, about a month rather than a season, discarded on use. Sharing the existing term would make ADR 0009's "never copied between seasons" read as violated. |

## Design

### The lifecycle

```
29 Aug   No 2026-09-01 season exists anywhere. Leader opens stand down, opens
         the roll-call panel, ticks whoever liked the message. Writes to
         cwl_roll_call keyed (clan_tag, '2026-09'). No CWL table touched.

~1 Sep   Collector pulls league_group, normalizeGroup creates cwl_seasons and
         cwl_members for '2026-09-01' from the in-game signup roster.
         05:00 UTC

first    seed_cwl_roll_call runs: matches target_month to the season's month,
open     writes member_availability for the intersection with cwl_members,
after    stamps roll_call_at with the roll call's recorded date, deletes the
         roll-call rows. Day 1 opens with availability already set.
```

The leader marks availability exactly once, before the season exists, which is
the requirement this spec is written for.

### Joining the month to the season

The staging table is keyed `2026-09`; the season id is `2026-09-01`. The join
goes through `seasonMonth` / `seasonMonthKey` (`apps/web/src/cwl/cwl-season-id.ts`)
and their SQL equivalent, never a string comparison or a `LIKE`. Assuming the
season id was `YYYY-MM` is the exact defect [#91](https://github.com/nswanger/clash-of-clans/issues/91)
shipped, twice, and it failed quietly both times.

### The stale rule (D9)

The seed function deletes every `cwl_roll_call` row for the clan whose
`target_month` is **strictly before** the seeded season's month. A `2026-09` roll
call orphaned by a broken collector is therefore cleared the next time any season
seeds, with nothing surfaced.

**Implementation note — this is `<`, where the spec first said `<=`.** Deleting
the matched month on the way out would make the unmatched list reportable exactly
once, on the very first load of the season, and gone on reload; the surface could
then never answer "who said yes and did not make the group" again. Keeping the
seeded month's rows until the *next* season seeds costs one comparison, satisfies
D9 unchanged (an orphan is still cleared silently by the next seed), and keeps
the roll call's lifetime to a single season rather than a retained history. It is
also what makes the seeded-from note on the lineup workspace derivable all
season, which is the stated requirement that this data be available throughout
CWL.

### What the report reads

| `roll_call_at` | `status` | assigned | attacked | reads as |
|---|---|---|---|---|
| set | `available` | yes | no | **Ghosted** -- promised, was picked, did not attack |
| set | `available` | yes | yes | Promised and delivered |
| set | `unavailable` | -- | -- | Promised, then withdrew (`recorded_at` says when) |
| null | `available` | -- | -- | Leader marked available mid-season, no promise |

Attack evidence comes from `cwl_member_reliability`
(`assigned_opportunities` vs `completed_assigned_attacks`), already loaded by the
lineup workspace (`apps/web/src/data/operations.ts:647`). No new view.

### The stand-down surface

ADR 0002 makes the countdown the page's largest object and requires the page to
read as absence rather than reassurance. Both survive: the roll call is stacked
**beneath** the countdown as the one thing the leader can do about the season the
timer is counting toward, rather than beside it in a column that would claim to
be what the page is about. A control is not a claim that everything is fine; it
is somewhere to put the answer to the thing already arriving.

Nothing here keys on how near the 1st is. A page that promotes the roll call at
some number of days out reorganises itself on a date nobody chose, which is the
hidden conditional ADR 0002 built a visible phase control to avoid -- and the
condition is already the phase, since stand down is only reachable when one
season is over and the next is coming.

The panel lists current clan members from `member_roster_overview` where
`is_current_member = true`, the same source the workspace already queries. The
per-member control is `cm-check`, the app's existing 44px tick row, and the reuse
is exact: both it and the in-game checklist are a leader working down a roster
ticking people off, and only the middle slot differs.

Below 720px the panel is a sheet reached from a `cm-button` under the countdown;
above it the panel is docked and always open, with no trigger and no close
control -- "where a docked panel has no other occupant it opens on the first row
by default and carries no close control", since there is nowhere to dismiss it
to.

**Two page rules override `cm-` components here and both carry an ancestor**, as
the design rules require: `.cwl-rest-page .cm-panel-evidence` takes a two-line
floor, because a shown-count clause that appears and disappears rewraps the line
and moves the search field under the fingers typing into it; and the empty state
fills the box rather than sitting at the top of it, so an empty roll call and a
search with no matches both read as "nothing here" rather than as a list that
failed to load.

**Rejected on the way:** an inner scroll region for the list, which put a second
scrollbar inside a page that already had one; a two-column name flow, which
halved a fifty-row roster but bought little once the list became the answers
rather than the roster, and which overflows sideways in the height-constrained
box the list had to become; and forcing the overlay mounting at all widths, which
fought the component layer instead of giving the surface a place to dock.

## Schema

One migration, applied with `supabase db push` **before** any surface reading it
ships (AGENTS.md, ADR 0003).

1. **`public.cwl_roll_call`** -- `(clan_tag text, target_month text, player_tag
   text, recorded_by uuid not null references profiles(id), recorded_at
   timestamptz not null default now())`, primary key `(clan_tag, target_month,
   player_tag)`, `CHECK (target_month ~ '^\d{4}-\d{2}$')`. No foreign key to
   `cwl_seasons`, `cwl_members` or any player table -- D1, and the check
   constraint is what keeps the month key canonical in the absence of one.
   Presence of a row means *said yes*; there is no status column, because D8
   makes absence the only other state.
2. **`member_availability.roll_call_at timestamptz`** -- nullable, written only
   by the seed function, never by `saveAvailability`. Column comment records
   that it is immutable by design (D4) so the next reader does not "fix" it.
3. **`public.seed_cwl_roll_call(requested_clan_tag text, requested_season_id
   text)`** -- `SECURITY DEFINER`, `is_leader()` guarded, idempotent. Resolves
   the season's month, inserts `member_availability` rows with `status =
   'available'`, `recorded_by = auth.uid()`, `roll_call_at` from the roll-call
   row, for the intersection with `cwl_members`; `ON CONFLICT DO NOTHING` so a
   season already carrying availability is never overwritten. Returns the seeded
   count and the unmatched player tags (D7) as jsonb. Deletes the clan's
   roll-call rows for months strictly before that month (D9, and see the stale
   rule above for why it is not at-or-before).
4. **RLS and grants** on `cwl_roll_call` matching the `member_availability`
   pattern in `202607110002_rls.sql`: leaders read and write, `select, insert,
   update, delete` to `authenticated`.

The existing `audit_availability_change` trigger fires on the seed's inserts, so
seeded availability lands in `audit_events` with no extra work. That is wanted:
the seed is a write on the leader's behalf and should be visible as one.

## Application changes

- **`apps/web/src/cwl/cwl-countdown.ts`** -- `rollCallTargetMonth`, beside
  `nextCwlStart` and derived from it (D2).

  **Implementation note — this did not go in `packages/domain`, as the spec first
  said.** That package holds contracts shared across the workspace, and nothing
  outside the web app touches the roll call: the collector must not, by D6.
  `nextCwlStart` also already lives in the web app, so honouring the spec's letter
  meant either moving it across a package boundary in unrelated work or writing a
  second copy of the arithmetic D2 exists to keep single. The types live beside
  the other surface contracts in `operations.ts`. A domain contract becomes right
  the day a second consumer appears.
- **`apps/web/src/data/operations.ts`** -- `loadRollCall`, `saveRollCallEntry`
  (upsert/delete on tick), and a `seedCwlRollCall` RPC call issued on the CWL
  route's season load. The seed result feeds the note naming unmatched members.
- **`apps/web/src/cwl/cwl-rest.tsx`** -- the roll-call panel in both mountings,
  the narrow-viewport control that opens the sheet, and `rankRollCall`;
  `cwl-rest.css` gains the stacked placement, the list's row-count floor and the
  two ancestor-scoped overrides above.
- **`apps/web/src/design/layout.tsx`** and **`design/tokens.css`** --
  `LIST_MAX_ROWS` and `--cm-list-max-rows`, the two halves of ADR 0024.
- **`apps/web/src/cwl/cwl-lineup-workspace.tsx`** -- the seeded-from-roll-call
  note, naming the roll-call date and anyone who said yes but is not in the
  group.
- **`apps/web/src/test/e2e-client.ts`** -- roll-call rows and the seed RPC. Per
  AGENTS.md the stub's filters hold only where the fixture models the column, and
  anything read against the clock is dated from the clock, so the target month
  must be fixture-derived rather than hard-coded.

## Documentation

- **ADR 0002** -- an amendment in the established form: stand down becomes a
  working surface, and why that is a reading of "absence, not reassurance" rather
  than an exception to it.
- **ADR 0009** -- a clarifying amendment: seeding a season's availability from a
  roll call gathered *for that season* is not the cross-season copy the record
  bans. Without it the seed reads as a violation to the next person.
- **`CONTEXT.md`** -- the *Roll call* entry (D11).
- **[ADR 0024](../decisions/0024-design-list-length-and-reveal.md)** -- the
  ten-row list cap and the narrowing rule, generalised out of this surface at
  Nick's request so the next list to meet the same question inherits an answer.
- **`design/components.md`** -- no new component. One new token,
  `--cm-list-max-rows`, whose other half is `LIST_MAX_ROWS` in the React system
  layer; the rule is recorded against `cm-rows` and the stand-down page-layer
  entry is rewritten for the surface as built.

## Validation

- `supabase test db` with pgTAP coverage for: the seed is idempotent; a season
  already carrying availability is not overwritten; unmatched tags are returned
  and not written; `roll_call_at` survives a later `saveAvailability`; the stale
  discard clears an orphaned earlier month.
- `pnpm typecheck`, `pnpm test`, `pnpm e2e`, `pnpm build`.
- `python3 scripts/doc_lint.py --strict` after the ADR amendments.
- `git diff --check`.
- Appearance checked by hand against `design/prototype/` at 375px and 1280px in
  both themes.

## Deliberately not in scope

- A retained roll-call history and any member-panel surface for it (D3).
- Collecting the reactions themselves. The API exposes no clan chat, and any
  external channel is [#85](https://github.com/nswanger/clash-of-clans/issues/85),
  which wants its own workflow and privacy decision first.
- A reconciliation script or scheduled job. The comparison is a read.
- The readiness checklist ([#83](https://github.com/nswanger/clash-of-clans/issues/83)),
  whose "availability completion" item this feeds but does not implement.
- Any change to how the recommender weighs availability.

## Risks

- **The first collector recommendation of a season runs unseeded.** `main.ts:34`
  generates one whenever `activeCwl && runFinalized`, which will fire before the
  leader first opens the app, producing a recommendation with every member
  `unknown`. Accepted: it is superseded on the next run, and ADR 0002 already
  judged machine recommendations not worth a surface.
- **September 2026 is the first live exercise.** The roll call is written days
  before any September data exists, so the seed cannot be verified end-to-end
  against production until the season lands. pgTAP and the e2e stub cover the
  mechanism; the timing is exercised once, for real, on 1 September.
- **A promise is up to several days old at signup.** Someone who liked the
  message on the 29th may leave the clan before the 1st. They simply will not be
  in `cwl_members` and will appear in the unmatched list, which is the honest
  outcome rather than a failure mode.
