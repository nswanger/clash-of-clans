---
status: accepted
date: 2026-08-15
deciders: [Nick]
type: design
supersedes:
---
# Five semantic marks, info never raises a notice, one notice region per screen

## Context
Notices and colored states were stacking and reassuring. Alternatives: info-colored banners; multiple notice regions; a success mark for API-observed values. Locked in [#19](https://github.com/nswanger/clash-of-clans/issues/19).

## Decision
Five marks: success, caution, danger, info, unknown. Color states an evaluation or a category and never raises a notice. Info marks a category only and is the lowest-chroma state. One notice region per screen: highest severity wins, extras are counted and expandable, never stacked; only collection health and a save conflict / failed request may occupy it, both danger — success, caution, and info never appear there. Provenance is marked by presence (observed carries the info rail; planned carries nothing) and observed is not success. No activity value may read as negative: the values are `observed`, `no_change`, `unknown`.

## Consequences
- A "happy path" banner is a violation; the resting phase (0002) is an empty state, not a notice.
- Adding a sixth mark or a second notice region reopens this record.
