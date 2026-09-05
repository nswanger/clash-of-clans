---
status: accepted
date: 2026-08-01
deciders: [Nick]
type: design
supersedes:
---
# The planned lineup and the API-observed lineup are separate state; planning history is not archived

## Context
A shared lineup workspace needs a leader-owned plan per war day, while the Clash API reports what the game actually held. Alternatives: treat the API roster as the plan; archive every planned-versus-actual change for later analysis. Resolved in the CWL lineup-planning map (`docs/_archive/cwl-lineup-planning/`).

## Decision
Season availability (`unknown | available | unavailable`, a missing row is `unknown`, never copied across seasons) is separate from the daily planned lineup, which is initialized from the prior day and thereafter independent — re-inheritance is explicit and edits never cascade. The planned lineup is operational state for the active season, not a second historical source of truth; the API remains authoritative for the observed lineup and results. Inter-day movement history is not retained; only compact operational events (initialize, save, re-inherit, lock changes, observed refresh) feed Lineup History.

**Clarified by [#96](https://github.com/nswanger/clash-of-clans/issues/96): seeding a season's availability from that season's own pre-season roll call is not the cross-season copy this record bans.** The clause above forbids carrying one season's answers into the next, because last month's yes is not evidence about this month. A roll call is gathered *for* the season it seeds, weeks before that season exists, and is discarded when the following season seeds — so it is the same season's answer arriving early rather than a previous season's answer arriving again. Without this said plainly the seed reads as a violation.

Two consequences follow and neither reopens the clause. `member_availability` gains `roll_call_at`, an immutable marker recording that a member made a pre-season promise, which is what survives the leader later editing that row; a mid-season withdrawal stays the ordinary status flip, since `roll_call_at` and `status` read together already separate "promised and still on the hook" from "promised, then withdrew". And a roll call naming someone who never made the CWL group is reported rather than written — it is usually a full roster or a leader oversight, not the member failing, and this record's own principle that the API is authoritative for the group is what settles who was actually signed up.

**Clarified by [#101](https://github.com/nswanger/clash-of-clans/issues/101): seeding a day's plan from the collected war roster is initialization, not the overwrite the consequence below forbids.** The clause protects a plan a leader has built. A day opened after its war was collected has no plan yet, and a day opened before that with nothing saved, locked, or re-inherited holds no leader decision either; in both cases the observed roster is the best available starting point, and it is the same rule the applied-lineup baseline already uses, so the two agree on open instead of presenting fifteen removals. Once a leader has acted on a day, observation reaches it only through the baseline, as before. `seed_source` records which starting point a day had.

## Consequences
- Observed evidence never overwrites a plan a leader has acted on; the applied-lineup baseline (#36) reconciles the two. A plan's initial membership may come from observation (#101).
- Post-season planning state is disposable; analysis of plan-versus-actual would need a new decision.
