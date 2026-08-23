---
status: accepted
date: 2026-08-16
deciders: [Nick]
type: design
supersedes:
---
# The members roster is a 62px row plus a shared detail panel, with a 1- and 7-day activity window

## Context
The member card was 621px at 390px wide — 33 phone screens for a 44-member roster. The roster was the contrasting proof for the system: list-heavy, read-mostly, per-person. Locked in [#22](https://github.com/nswanger/clash-of-clans/issues/22); reference `design/prototype/members-roster.html`.

## Decision
A 62px row with everything else one tap away in the shared panel (sheet below 720px, docked above; docked opens on the first member and has no close control; narrow never auto-opens). One new component: the summary strip. No action bar — there is nothing to save. Rows mark the exception: `observed` is silent; only `No change observed` and `Building history` are marked, muted, never negative. Selection is the accent on the border plus a background shift, never the rail (which carries provenance). Activity window is 1 day and 7 days; 30 days is not offered. Desktop columns are gated on a container query, not the viewport, with a header row and one shared explicit track list. The bottom sheet is shared behaviour: header-only drag to dismiss past 28% or on a flick, `prefers-reduced-motion` honoured.

## Consequences
- The CWL day strip and the activity-window selector are one component, `.segmented`.
- War figures are all-time and labelled so; windowing them is [#34](https://github.com/nswanger/clash-of-clans/issues/34).
- The action bar is confirmed as editing-layer, not system.
