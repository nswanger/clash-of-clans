---
status: accepted
date: 2026-08-15
deciders: [Nick]
type: design
supersedes:
---
# Clan Muster color: one warm ramp, gold as a surface in light mode, unknown carries no hue

## Context
The inherited UI had 100 hex colors and an accent that failed WCAG AA as text. Alternatives: keep the accent and darken it (it turns bronze and reads muted); add a second accent; allow an "unknown" color. Locked in [#16](https://github.com/nswanger/clash-of-clans/issues/16); every pairing verified numerically, none by eye.

## Decision
Gold fills, it does not write — in light mode (6.80:1 with dark ink on it; interactive ink is bronze `gold-700`); in dark mode gold does both. One hue family with luminance shifting by theme, no second accent. The whole ramp is warm (neutrals ~40°, gold 43°, danger 16°, success moss 101°). Unknown carries no hue: absent evidence renders as muted text and an em-dash. Two contrast roles: `--cm-hairline` (decorative, below 3:1) and `--cm-border-control` (≥3:1, WCAG 1.4.11).

## Consequences
- Token values live in `design/tokens.css`; this record is why they are shaped so.
- A request for a second accent or a colored "unknown" reopens this record.
