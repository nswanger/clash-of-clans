---
status: accepted
date: 2026-07-10
deciders: [Nick]
type: business_rule
supersedes:
---
# CWL core/rotation defaults are season settings, and eight stars makes a member rotation-eligible

## Context
15-player and 30-player CWL reward different things: reliability versus spreading the eight-star full-reward threshold across the roster. Alternatives: a single fixed lineup policy; permanent member labels (core/rotation); separate engines per war size. Clan policy decisions like this must be documented (AGENTS.md) because they are re-litigated every season.

## Decision
One recommendation engine, driven by season settings: war size, target core size, rotation positions, priority mode, and whether eight-star rotation is enabled. Initial defaults: `10 core + 5 rotation` (15-player), `20 core + 10 rotation` (30-player). For 30-player, emphasize attack reliability and replacing missed attackers; for 15-player, balance reliability with rotating toward eight stars. Core membership is recommended *stability for this season*, never a permanent member label. Reaching eight stars makes a member eligible to rotate out but never requires removing every reliable attacker at once; the target core is preserved unless a leader overrides. Assigned opportunities are shown beside completed and missed attacks because opportunity is partly a leader choice.

## Consequences
- Season settings are data, so a leader can change policy without a release.
- Bonus priority (0001) and rotation are separate signals that both read the eight-star threshold.
- The exact standings-versus-rewards balance remains a leader judgement the tool explains rather than decides.
