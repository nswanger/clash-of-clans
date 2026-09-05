# Collector status board inside Admin, gated by an operator role

Spec for [#117](https://github.com/nswanger/clash-of-clans/issues/117).
Decisions settled with Nick in a grilling session on 2026-09-05. Several of them
overturn premises in the issue body, and those are recorded first, because the
issue is a request and this is the answer.

## What the issue body gets wrong

1. **The schema guard never reaches the browser.** `schema_behind` is a
   collector-process health status (`apps/collector/src/schedule.ts`,
   `evaluateHealth`) consumed by the Docker healthcheck and
   `verify-collector.sh`. The `collection_status` enum in the database has
   five values and none of them is `schema_behind`, so nothing in Admin can
   show it. The "wall of text" is the two-clause freshness sentence plus the
   notice copy, not a schema readout.
2. **The section is already exception-only.** A healthy run renders one muted
   sentence and a status chip; the notice and the per-endpoint list appear
   only when the run is unhealthy. The presentation problem is smaller than
   the issue describes, and the real gap is the opposite one: an operator
   cannot see the six endpoints *at all* while the run is healthy.
3. **There is no "only Nick" to key on.** `app_role` is exactly
   `('admin', 'leader')`, `is_leader()` is true for both, and `user_roles` has
   no per-account flag. A second admin — the clan leader — is planned, and
   would be indistinguishable from the operator at every layer.

## Decisions

### The audience gate is a third role, and it enforces nothing yet

`app_role` gains `operator`. Nick holds it beside `admin`; the leader holds
`admin` alone. Nothing in the database changes hands: `collection_runs` and
`collection_attempts` stay readable by `is_leader()`, because "is this data
trustworthy" is a leader's question and ADR 0002 put health in Admin for the
leader to read.

The role exists today for one job — deciding who sees the status board — and
for one future: any write action against the collector (a rerun, a schedule
change) is an RPC whose first line is `has_app_role('operator')`. Nick's
requirement was that collector permissions never ride on the access-management
permissions the leader will hold, and a role is the only shape that gives a
future write action a database check rather than a UI hope. A UI-only flag was
rejected for the reason ADR 0003 and ADR 0025 both record: a guard that lives
only in the surface is a guard that has already failed once.

This is an addition under ADR 0005's stated consequence ("roles ... can be
added without touching CWL data") and does not reopen it.

### It is a section of Admin, not a fourth route

ADR 0002's test is one route per question a leader asks. "Did each pull happen
and when is the next one" is a question one account asks. Three facts and a
six-row list do not fill a page, and a route visible to one person is the
empty-tab failure that record deleted three routes for. Admin therefore keeps
collection health as today for every admin and adds a **Collector** section
beneath it for operators only.

The section title is "Collector" rather than "Monitor": the board describes the
process, and a monitor is what the whole Admin page already is.

### The full status board is a deliberate exception to ADR 0014

ADR 0014 bans the happy-path banner, and the Admin health section honours it by
drawing only failures. The Collector section draws **all six endpoints every
time**, healthy or not. That is not a banner: the question the board answers is
"did each pull happen", not "is everything fine", and a schedule board that
hides its completed rows cannot answer it. The exception is bounded three
ways — operator-only, `cm-statustext` marks on rows rather than colour blocks,
and no notice — and it is recorded here so that the next surface wanting a
green table has to make the same argument.

No decision record is amended. ADR 0014's rule stands for every leader-facing
surface; this is a bounded operator exception under it, and a second such
exception is what would reopen the record.

### Rerun is cut, and the seam is named

Nick judged an in-app rerun a nice-to-have he would never press. The history
agrees: the two faults on record (the WAN-IP allowlist, the idle league-group
404) both resolve on the next scheduled run. Rerun is out of scope.

If it returns, the shape is fixed now so nothing built here blocks it: a
request row in a table the collector reads on its existing lease heartbeat,
inserted through an RPC guarded by `has_app_role('operator')`. The collector
stays outbound-only (ADR 0006, ADR 0025) and polls Supabase, not the Clash API,
so the API call rate does not change. Endpoint-scoped reruns are further out
still: collection is one dependent pass (clan → members → players; league group
→ league wars) and there is no code path to run one endpoint alone.

### "Next run" is one column the collector already knows

The scheduler computes the next run as a `Date` in `nextCollectionAt` and sleeps.
It is never persisted. `collection_runs` gains `next_run_at timestamptz`,
written when the run finishes. This is the only schema change the surface
needs, and it is written by the collector as `service_role`, so RLS is
unchanged.

`schema_behind` is **not** persisted by this work. It would be honest to show —
it is the quiet failure ADR 0025 exists for — but Nick placed host-side faults
(WAN IP, schema ordering, key expiry) as backend-only signals for
`verify-collector.sh` and the container healthcheck, and the board must not
grow into a second copy of that script. Revisit if a real reading of the board
was misled by its absence.

## Schema

One forward migration:

```sql
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'operator';
ALTER TABLE public.collection_runs ADD COLUMN next_run_at timestamptz;
COMMENT ON COLUMN public.collection_runs.next_run_at IS
  'When the collector scheduled its next run after this one finished; null while running or if the run crashed (#117).';
```

- `is_leader()` is untouched: an `operator` who is not also `admin` or
  `leader` is denied at sign-in, which is correct — the role is additive, never
  a route in.
- `has_app_role('operator')` already works through the existing function.
- pgTAP: the enum carries the value; a user with only `operator` fails
  `is_leader()`; a user with `admin` and `operator` passes both checks.
- Order is schema-before-artifact as always: `supabase db push` before either
  the Pages deploy or the collector image.

## Collector

- `SchedulerDependencies.collect` result already carries what
  `nextCollectionAt` needs; `runNow` calls `schedule(...)` with it. The change is
  to compute the next run once, pass it to `finishRun` so the row is written
  with `next_run_at`, then arm the timer from the same value. One value, two
  consumers, no drift.
- A run that throws writes no `next_run_at` (the retry path schedules on
  `true`, and the crashed row is not the place to record a guess).
- The baked migration manifest picks the new file up on the next build.

## Web app

### Session

`AppSession` gains `isOperator: boolean`, resolved with a third
`has_app_role` call beside the two that exist. `role` keeps its current
`"leader" | "admin"` meaning: operator is orthogonal, never a substitute.

### Admin: the health section for every admin, only when something is wrong

**The section renders only when the run is unhealthy.** A healthy run puts
nothing on the page for a leader-side admin: no chip, no "data last observed
fresh" line, no heading. This is exception-only reporting, the stance ADR 0014
already takes for rows ("surfaces mark the exception") applied to the section
itself: silence means the data is current, and the one danger notice is where
that stops being true. Nick's framing — "everything is ok unless there is an
error", which is how most applications behave — is the same rule from the
reader's side.

When unhealthy, the section is what it is today: heading, the run state as a
danger `cm-pill`, the danger notice (still the screen's one notice), and the failing-attempt list.
The notice's second line carries the last fresh instant, because that is the
number a leader needs to read everything else by and it no longer has a
resting place above.

The `running` state renders nothing either: a run in progress is not a fault.

The CWL and Members surfaces are unaffected; their stale caveats already fire
only on an unhealthy status.

### Admin: the Collector section for operators

Rendered only when `session.isOperator`; a non-operator admin sees nothing in
its place, not a placeholder.

- **Head:** `Collector`, the run state beside the title as the same
  `cm-pill` the rows use — `HEALTHY` in success, anything else in danger —
  so one word in one shape means one thing everywhere on the page (the
  `cm-statuschip` was tried here and read as a second vocabulary for the same
  state); and trailing, `Next run
  <relative day>, <clock>` — `tomorrow, 14:02`, `today, 15:00`, or the
  date when further out; `Next run not scheduled` when `next_run_at` is null
  on a finished run, which is the crash case.
- **Run line** (`admin-freshness`): `Last run <date>, <start clock> –
  <end clock> · every 24 h while idle` (or `every hour during CWL`, from
  `active_cwl`). `..., still running` while unfinished. When the run was not
  healthy the line ends `· data last fresh <date>, <clock>`, so the operator
  sees the gap the leader's notice describes.
- **Rows carry no time.** The run line above gives the window every attempt
  fell in, so a healthy row ran then by definition and a failed row's minute
  changes nothing the operator would do. Six rows repeating a timestamp is
  what made the old facts list hard to trace.
- **Endpoint board:** `cm-rows`, one `cm-row` per endpoint in the fixed order
  `clan · members · player · current_war · league_group · league_war`, six
  rows always. Each row: endpoint name as `cm-row-name`; meta line opening
  with a `cm-pill` — the same mark People uses for a role, so a state word on
  this page is always one shape — `is-success` for healthy, `is-danger` for
  any failure, bare for an endpoint with no attempt in this run; then
  `HTTP <code>` and the error category when present, then `finished
  <instant>`. The trailing `cm-row-figure` is the attempt count, `49 pulls`.
  An endpoint with several attempts in one run (players) shows the worst
  state and how many: a `3 failed` danger pill beside `49 pulls`.
- **No notice.** The danger notice for an unhealthy run stays where it is, in
  the health section above, one per screen (ADR 0014). The board is never the
  place a fault is *announced*; it is where it is *located*.
- The idle-CWL `partial` rule (`isExpectedIdleCwlPartial`) still clears the
  notice above; on the board the league-group row simply reads `404 ·
  not_found` in `is-unavailable`, because the board shows what happened and
  the health section decides what it means.

### Admin: keeping the page from growing

Two lists on Admin grow with time and were already noisy at three live days.
ADR 0024's ten-row cap was the first answer and it is the wrong one: that rule
is for lists a leader scans or searches, and these are a log consulted when
something is wrong — "did I actually revoke that". Nick does not create
invitations daily, and a revoked or expired invitation is not a thing to look
at, it is a thing to have done. So:

- **Invitation history is removed as a section.** A pending invitation is
  the only state that carries an action (Reissue, Revoke), and it is a person
  who does not exist yet, so it renders as a row at the bottom of People:
  `Invited, not yet signed in`, a caution `pending` pill, who invited and
  when, when it expires, and its actions behind the row's menu control
  ([#125](https://github.com/nswanger/clash-of-clans/issues/125): one
  `cm-iconbutton` opening a `cm-routemenu`, never inline ghosts). Every other invitation state —
  created, reissued, revoked, redeemed — is already an `audit_events` row,
  so the history section was the access log re-sorted by invitation. The
  "links are never stored" sentence leaves the page foot: it belongs beside
  the one link it is about, inside the fresh-invitation block, and nowhere
  else.
- **Access activity is a section closed by default**, its head carrying the
  count so a closed log still says how much is behind it, opened by the head.
  It is renamed from "Recent access activity": it is the whole log, newest
  first. **Every row is one shape:** a content-sized first column holding
  the time — `4 Sep 21:10`, day, month and 24-hour clock, never wrapping, no
  year for the current year — and the event text in the rest, so the time
  column reads straight down on a phone and a long event wraps inside its own
  column instead of pushing the time to a second line. The format is fixed
  rather than locale-driven: `Intl` with a locale's 12-hour clock and comma
  is what made the column wrap. **It pages at ten**, `1–10 of 31` with Newer / Older ghosts: this is
  the pager case ADR 0024 names, "a surface whose rows are walked through
  rather than searched", and it is built now rather than when the log is
  long, because a log is always eventually long and Nick would rather not
  revisit it in a few weeks. Server-side: `range()` on `audit_events`
  ordered by `occurred_at desc`, with the total from a `count: "exact"`
  head request.
- Section order becomes: Collection health · Collector (operator) · People ·
  Access activity (closed). Trust of the data stays on top because everything
  below is read in its light.

### Tests

- Vitest: the Collector section renders for an operator session and not for
  an admin session; six rows always; worst-status aggregation for repeated
  endpoints; a pending invitation is a People row with Reissue and Revoke and
  a redeemed one is not; the access log is closed on load, opens from its
  head, shows ten with the range and total, and Older requests the next
  range; the health section is absent for a healthy or running run and
  present with the notice for any other. Queries by role and text only.
- `apps/web/src/test/e2e-client.ts`: the stub learns `has_app_role('operator')`
  and `next_run_at`.
- Playwright: the operator fixture sees the board; the admin fixture does
  not.

### Design system

Two findings for `design/components.md`, both recorded there when built:

- **`cm-pill` gains `is-danger`.** The inventory carries success and caution
  only because no leader surface ever needed a danger pill — rows mark the
  exception with `cm-statustext`. The board's "failed" is a state word in the
  same slot People puts a role, and a second shape for the same job on one
  page is what the reuse rule exists to stop.
- **A section closed until opened** — the access log. A `<details>` whose
  `<summary>` is the `cm-section-head`, the chevron rotated as
  `cm-routebutton-chev` already does for the route menu, no third disclosure
  glyph. First use; a second surface wanting one is what would promote it
  from the `admin-` page layer.
- **A pager** — ten rows, `first–last of total`, two ghosts. ADR 0024
  anticipated it and left it to the first surface that needed one; this is
  that surface. `LIST_MAX_ROWS` is the page size, so the two halves of that
  rule stay one number.

No new token. The endpoint board is `cm-rows` at the page layer under the
`admin-` prefix.

### No explanatory prose under a section

Nothing on Admin is followed by a sentence explaining what the reader just
saw. The UI has to be legible from its labels, marks and counts; a paragraph
beneath a list that says what the list is for is a sign the list failed. This
spec's mockup shed three such paragraphs in review. The rule and the sweep of
the other surfaces that carry one are [#124](https://github.com/nswanger/clash-of-clans/issues/124).

## Out of scope, and where it goes

- **Linking an app user to a clan member.** Nick wants to correct a sign-up
  that named the wrong member or a member who renamed. There is no such link
  today: `profiles` is `id, display_name` and no table carries a
  `player_tag` beside a user. It is a data-model decision (what the link is
  for, since nothing reads it yet, and whether a leader or only an admin may
  change it) before it is a UI, and it belongs in its own issue. The People
  row in this spec is left as the natural home for the control once the model
  exists.
- **In-app rerun.** Cut above; seam recorded.
- **Persisting `schema_behind`.** Deferred above.
- **A mockup** precedes the build: Nick reviews the Admin page as a whole,
  including the two list caps, before anything ships.
