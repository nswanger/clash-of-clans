---
status: accepted
date: 2026-08-16
deciders: [Nick]
type: design
supersedes:
---
# Pending changes track two baselines — unsaved against the plan, and the plan against the game

## Context
The redesign exists for one task: make swaps here, then replicate them in Clash on the same phone. The first attempt merged "unsaved" and "not yet done in game" and the checklist evaporated on Save. Locked in [#21](https://github.com/nswanger/clash-of-clans/issues/21); reference `design/prototype/lineup-adjust.html`.

## Decision
Two independent questions with two baselines: the draft against the saved plan, and the saved plan against the game. The applied-lineup baseline is a record of physical acts (base set plus confirmed check-offs), deliberately not keyed to a revision, so a reverted change reappears as a fresh instruction the other way. Order changes are not on the checklist (the game orders by base weight; a move here is transcription) but still gate Save. Removals lead, because the game refuses an add before a remove at war size. Check-off is manual; observation replaces the baseline wholesale. A moved revision is the save-conflict notice and outranks stale collection for the one notice region; it fires only mid-checklist. Violet marks an unsettled change; where it appears says what it is unsettled against. The checklist is the shared panel. State fills take `--cm-surface` as ink, not `--cm-on-accent` (2.49:1 on success-light).

## Consequences
- The baseline is server-side, plan-scoped state ([#36](https://github.com/nswanger/clash-of-clans/issues/36)), so a co-leader's applied swaps are not redone.
- `cwl_war_members.map_position` is the in-game order once a war day exists; manual reordering is only for planning ahead.
