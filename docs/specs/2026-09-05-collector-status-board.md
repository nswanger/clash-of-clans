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

### Admin: the health section for every admin

Unchanged in structure. Two copy fixes:

- The freshness sentence drops the run timestamps. It reads
  `Data last observed fresh <instant>.` and nothing else; when the run is
  still in progress, `A collection is running.` follows it. Started/finished
  times belong to the Collector section.
- The status chip stays.

### Admin: the Collector section for operators

Rendered only when `session.isOperator`; a non-operator admin sees nothing in
its place, not a placeholder.

- **Head:** `Collector`, with the same status chip as the health section and,
  right-aligned, `Next run <instant>` (or `Next run not scheduled` when
  `next_run_at` is null on a finished run, which is the crash case).
- **Run line** (`admin-freshness`): `Latest run started <instant>, finished
  <instant>.` or `..., still running.`
- **Endpoint board:** `cm-rows`, one `cm-row` per endpoint in the fixed order
  `clan · members · player · current_war · league_group · league_war`, six
  rows always. Each row: endpoint name as `cm-row-name`; meta line carrying a
  `cm-statustext` (`is-on`-equivalent for healthy, `is-unavailable` for any
  failure, `is-unknown` for an endpoint with no attempt in this run), then
  `HTTP <code>` and the error category when present, then `finished
  <instant>`. An endpoint with several attempts in one run (players) shows the
  worst status and the count: `49 pulls · 1 failed`.
- **No notice.** The danger notice for an unhealthy run stays where it is, in
  the health section above, one per screen (ADR 0014). The board is never the
  place a fault is *announced*; it is where it is *located*.
- The idle-CWL `partial` rule (`isExpectedIdleCwlPartial`) still clears the
  notice above; on the board the league-group row simply reads `404 ·
  not_found` in `is-unavailable`, because the board shows what happened and
  the health section decides what it means.

### Admin: keeping the page from growing

Two lists on Admin grow with time and were already noisy at three live days.
Both come under ADR 0024:

- **Invitation history** sorts pending first, then by created time
  descending, and renders at most ten rows with `N of M shown`. Narrowing is
  deferred: at the current rate there is no filter worth a control, and the
  pending-first order guarantees the rows that carry actions are the ones on
  screen.
- **Recent access activity** renders the ten most recent events and says so.
  The title already promises recency, so ten is the honest content rather
  than a truncation.
- Section order becomes: Collection health · Collector (operator) · People ·
  Invitation history · Recent access activity. Trust of the data stays on top
  because everything below is read in its light.

### Tests

- Vitest: the Collector section renders for an operator session and not for
  an admin session; six rows always; worst-status aggregation for repeated
  endpoints; `N of M shown` on both capped lists. Queries by role and text
  only.
- `apps/web/src/test/e2e-client.ts`: the stub learns `has_app_role('operator')`
  and `next_run_at`.
- Playwright: the operator fixture sees the board; the admin fixture does
  not.

### Design system

No new component or token. `cm-statustext` gains no variant: the healthy mark
reuses the existing on-state, which is a finding for `design/components.md`
only if the existing classes prove insufficient during build. The endpoint
board is `cm-rows` at the page layer under the `admin-` prefix.

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
