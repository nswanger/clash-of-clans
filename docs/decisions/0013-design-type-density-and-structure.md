---
status: accepted
date: 2026-08-15
deciders: [Nick]
type: design
supersedes:
---
# Clan Muster type, density, spacing, radius, depth, and breakpoints

## Context
Fifteen font sizes with a 9px floor, seven ad-hoc breakpoints, 43 padding values, shadow used for separation. Alternatives: keep the system font fallback; a continuous shadow scale; per-use tracking. Locked in [#17](https://github.com/nswanger/clash-of-clans/issues/17) and [#18](https://github.com/nswanger/clash-of-clans/issues/18).

## Decision
Archivo, one family, for UI and display. Seven sizes, 12px floor (11px for uppercase labels only). Four weights. Tracking bound to size. Density follows the input device: comfortable base, `(pointer: fine)` opts into compact; `--cm-tap-min: 44px` never overridden. One 4px rhythm in seven steps; no sub-4px step (hairlines are borders). Radius soft (6/10/16) assigned by class of surface with one-step nesting. Depth is binary: flat surfaces separate by hairline and background shift; one shadow token, reserved for overlap. Focus is a solid ring. Two breakpoints, mobile-first: 720px and 1120px.

## Consequences
- Every value in `design/tokens.css` traces to one of these rules.
- New sizes, weights, radii, or breakpoints are a finding against this record, not an addition.
