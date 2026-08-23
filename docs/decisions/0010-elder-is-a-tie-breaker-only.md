---
status: accepted
date: 2026-07-31
deciders: [Nick]
type: business_rule
supersedes:
---
# Verified Elder status is only a final tie-breaker among otherwise comparable eligible candidates

## Context
Leaders wanted Elder status reflected in lineup recommendations. The API exposes `role` on the member list (wire token `admin` for Elder — distinct from this app's `admin` access role). Alternatives: Elder as a scored input; Elder overriding availability. Resolved in the lineup-planning map.

## Decision
Availability and participation decide eligibility and priority. Current, verified Elder status (mapped from the member-list role at normalization; missing/stale/unrecognized → unknown) is applied only as the last tie-breaker among otherwise comparable eligible candidates. It cannot override unavailable or unknown availability, missed attacks, current-CWL reliability, rotation or eight-star goals, Town Hall fit, or an explicit leader choice. When it affects a recommendation the UI says it was a tie-breaker.

## Consequences
- Role is joined from the latest member-list observation; it is not copied into season membership state.
- Unknown role disables the tie-breaker rather than assuming Elder.
