# Member History and Roster Overview — Schema Proposal

Status: Approved by Nick on 2026-07-19; implemented locally in migration `202607190012_member_history.sql`

## Recommendation

Use two normalized daily tables:

1. `clan_roster_daily_observations` records that a complete member-list response was successfully observed for a clan on a UTC calendar date.
2. `member_daily_snapshots` records the members present in that observation plus the selected member-list and player-profile facts needed by the first roster experience.

This is the smallest structure that can distinguish a departure from a failed or missing roster collection. It also allows an individual player-profile failure without treating the member as absent.

Do not store daily, 7-day, or 30-day deltas as columns. Derive them from the retained daily facts so reset handling and activity rules remain auditable and can be corrected without rewriting history.

## Evidence from the current product

- The collector already fetches clan, member-list, and every current member's player profile in each run.
- Default cadence is hourly while CWL is active or uncertain and every 24 hours while idle. Multiple active-CWL pulls therefore need to compact to one canonical row per UTC date.
- Raw snapshots are content-deduplicated and retained for 90 days. An unchanged response can reuse an older raw row, so canonical observation time must come from the current collection run rather than the raw snapshot row.
- Current normalization only handles `league_group` and `league_war`; member history needs a new normalization path.
- Current RLS grants authenticated leaders/admins read access through `public.is_leader()`. Collector writes use the service role. The new tables should follow that pattern and expose no browser write policy.
- Current hash navigation has Today, Availability, Season, and admin-only Access. The vertical slice should add Members and group CWL-specific destinations without changing the authorization model.

## Proposed tables

### `clan_roster_daily_observations`

Grain: one row per `(clan_tag, observed_on)`.

| Column | Type | Purpose |
| --- | --- | --- |
| `clan_tag` | `text` | Clan identity. |
| `observed_on` | `date` | UTC calendar date used for deterministic daily compaction. |
| `roster_observed_at` | `timestamptz` | Time of the latest successful member-list response retained for that date. |
| `collection_run_id` | `uuid` | Provenance to `collection_runs`. |
| `member_count` | `smallint` | Completeness/sanity check against the stored children. |

Primary key: `(clan_tag, observed_on)`.

Only a successful, validated member-list response creates or replaces this row. A day without this row is a collection gap, not evidence that anyone left.

### `member_daily_snapshots`

Grain: one row per `(clan_tag, observed_on, player_tag)` for a member present in the corresponding successful roster observation.

| Field group | Columns | Source |
| --- | --- | --- |
| Identity/display | `clan_tag`, `observed_on`, `player_tag`, `name` | Member list |
| Roster | `role`, `clan_rank`, `previous_clan_rank` | Member list |
| Progression/rank | `town_hall_level`, `trophies`, `league_id`, `league_name` | Member list |
| Seasonal counters | `donations`, `donations_received` | Member list |
| Player context | `war_preference`, `war_stars` | Player profile |
| Activity counters | `attack_wins`, `defense_wins`, `clan_capital_contributions`, `clan_games_points` | Player profile; `clan_games_points` is normalized from the relevant achievement value |
| Freshness/provenance | `roster_observed_at`, `profile_observed_at`, `profile_collection_run_id` | Current collection context |

Primary key: `(clan_tag, observed_on, player_tag)`.

Constraints should reject negative counters and invalid Town Hall/rank values. Player-profile-backed fields remain nullable when that endpoint fails. `profile_observed_at` makes that partial state explicit.

Within a UTC date, each newer successful roster response atomically replaces that day's roster membership and member-list facts. Successful player-profile responses enrich the corresponding daily rows. A later profile failure must not erase a successful profile captured earlier on the same date.

## Fields intentionally deferred

- Heroes, troops, spells, equipment, pets, labels, and builder-base details.
- Full achievement arrays; only the normalized Clan Games progress value needed for activity evidence is retained.
- A claimed `joined_at` or `last_active_at`; the API supplies neither.
- Stored activity scores or recommendation inputs.
- Separate member identity/dimension tables until a real cross-clan or rename-history requirement appears.

These can be added later without changing the daily grain.

## Derived roster and activity behavior

Create read views or query-layer projections rather than persisted delta columns:

- Current roster: members in the latest successful roster observation.
- Observation dates: `first_observed_present_on`, `last_observed_present_on`, and the start of the latest uninterrupted observed-presence period. These are observation facts, not authoritative join dates.
- Departure observed: the first later successful roster observation in which a previously present player is absent. Collection-gap days do not count as departures.
- Rejoin observed: presence after at least one successful roster observation recorded the player absent.
- Daily, 7-day, and 30-day changes: compare with the relevant retained baseline and return the baseline date alongside each delta. If the necessary baseline is missing, the delta is unknown rather than zero.
- Monotonic/seasonal counters: a lower current value signals a reset boundary; return no negative activity delta and expose `reset_observed` for that metric/window.
- Trophies: preserve signed change because decreases are valid and are not counter resets.
- Activity observed: report the changed metrics and observation window. The absence of changes must be labeled `no change observed`, never `inactive` or `last active`.

Activity outputs remain excluded from CWL recommendation scoring.

## RLS and access

- Enable RLS on both tables.
- Add authenticated `SELECT` policies using `public.is_leader()`.
- Add no authenticated insert/update/delete policies; collection and normalization remain service-role responsibilities.
- Keep the existing single-clan authorization assumption for this slice. Clan-scoped user access belongs to the later access-hardening work if multi-clan support becomes a requirement.

## Retention proposal

- Retain normalized daily roster observations and member snapshots indefinitely.
- Continue purging raw API snapshots after 90 days.
- Do not retain hourly normalized member rows; compact active-CWL collections into the daily grain.
- At a full 50-member roster, this produces at most 18,250 member rows per year per clan, plus 365 roster-observation rows. That is modest for Postgres, but table/index size and query latency should be reviewed annually.
- Indefinite retention means player tags, names, roles, and activity counters remain in backups after members leave. Treat the tables as leader-only operational history, avoid private notes, and document any future deletion/export policy before adding member-facing accounts or multiple clans.

## Approval requested

Approve or revise these three decisions before a migration is created:

1. Two-table grain: one complete roster observation per clan/UTC date plus one row per observed member/date.
2. Canonical field set: the compact identity, roster, progression, donation, war-preference, win, Capital, and Clan Games fields listed above; richer profile details deferred.
3. Indefinite normalized retention with 90-day raw retention and an annual storage/privacy review.
