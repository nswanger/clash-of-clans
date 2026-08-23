---
status: accepted
date: 2026-08-16
deciders: [Nick]
type: design
supersedes:
---
# The mobile lineup surface works by tap-to-swap with a separate reorder mode, not drag-and-drop

## Context
The lineup workspace used HTML5 drag-and-drop, which fires no events on touch, so the phone could never reorder. Alternatives: make drag work on touch; drag between lists; a four-control filter row. Locked in [#20](https://github.com/nswanger/clash-of-clans/issues/20); reference `design/prototype/lineup-adjust.html`.

## Decision
The unit of work is the swap: tap a row, get a panel on that member, tap a replacement — the panel also holds full evidence and availability editing, so the row carries only what you scan for. Reordering is its own mode (rows collapse to number, name, Town Hall, handle; pointer events; time-based auto-scroll with a quadratic ramp). Moves are marked by intent, not index — only what you dragged is marked, and dragging it back un-marks it; intent lives as long as the draft. The edge-marker slot carries provenance only; edit state is carried by the position number. One persistent action bar carries Save, the change count, and the in-game replication list; day-scoped actions live in the day strip's overflow. Rows mark the exception, never the rule. Candidates rank by availability, then rotation need, then rating. Desktop is the same layout at wider breakpoints: bench as a bottom sheet below 720px, docked column above, rail at 1120px.

## Consequences
- Drag between lists, the filter row, and the inline availability popover are dropped.
- Edit state may never be a second rail colour (measured 1.12:1 against the info rail).
- The lineup plan's order is a hand-kept mirror of in-game base-weight order the API does not expose.
