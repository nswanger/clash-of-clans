---
status: accepted
date: 2026-08-16
deciders: [Nick]
type: design
supersedes:
---
# Components sit in three concept-defined layers with cm- prefixed classes, is-* states, and data-attribute behaviour

## Context
Two surfaces had been designed against bare class names in standalone prototypes; a shared stylesheet during an incremental migration needed a convention that would not collide and would keep the prototypes as the spec. Locked in [#23](https://github.com/nswanger/clash-of-clans/issues/23); the inventory is `design/components.md`.

## Decision
Three layers decided by concept, not use count: system (same meaning on any page), editing (surfaces that change something), page (one surface's own vocabulary). `cm-` prefix on every component class. State and variants are compound `is-*` classes named for the semantic state (`.cm-pill.is-caution`), drawn from the five marks (0014). Classes carry appearance, data attributes carry behaviour; styled classes are never queried. No CSS Modules — one global stylesheet ported near-verbatim from `_prototype.css`. Utilities capped at five (`grow`, `count`, `eyebrow`, `empty`, `sep`). Unreachable rules are deleted, not kept as gaps.

## Consequences
- A variant that cannot be named from the five marks means the component is being asked to carry a meaning the system lacks.
- A restyle cannot break a click handler; a rebuilt surface's tests never query classes.
- `avail` → `cm-statustext`, `lockchip` → `cm-statuschip`.
