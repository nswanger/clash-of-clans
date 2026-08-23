---
status: accepted
date: 2026-07-19
deciders: [Nick]
type: structural
supersedes:
---
# Member history is two normalized daily tables, not retained raw snapshots

## Context
Raw API snapshots are purged after 90 days, so year-round roster questions (tenure, activity deltas, departures) had no durable source. Alternatives were to retain every raw response indefinitely, or a single wide per-member-per-day table. Neither distinguishes "the member left" from "the collection failed that day". Proposal reviewed and approved 2026-07-19 (`docs/_archive/member-history-schema-proposal.md`).

## Decision
`clan_roster_daily_observations` records that a complete member-list response was observed for a clan on a UTC date; `member_daily_snapshots` records the members present in that observation plus the selected member-list and player-profile facts. Retention is indefinite at this grain. Activity signals derived from it stay out of CWL recommendation scoring until validated.

## Consequences
- A departure is a member absent from a day that *has* an observation; a missing observation is a coverage gap, never a departure.
- A failed player-profile fetch leaves the member present with partial facts.
- Raw snapshot retention can stay short (purge job) without losing roster history.
