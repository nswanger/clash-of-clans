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

## Consequences
- Observed evidence never overwrites a plan; the applied-lineup baseline (#36) reconciles the two.
- Post-season planning state is disposable; analysis of plan-versus-actual would need a new decision.
