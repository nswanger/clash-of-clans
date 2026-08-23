---
status: accepted
date: 2026-08-16
deciders: [Nick]
type: design
supersedes:
---
# Loading has no copy, renders nothing for 250ms, and uses one skeleton primitive

## Context
Six ad-hoc `Loading…` strings across five files; flashes of placeholder on fast loads. Alternatives: a themed animation; per-surface skeletons; replacing a list with a skeleton on re-fetch. Locked in [#43](https://github.com/nswanger/clash-of-clans/issues/43); reference `design/prototype/loading.html`.

## Decision
Loading has no copy — `aria-busy` plus one visually hidden live region carries the announcement. Nothing renders for the first 250ms; the skeleton is scheduled, not shown. One primitive: a skeleton row is `.row` with muted blocks, inheriting the real row's geometry; page chrome renders normally. The control that triggered a fetch owns its pending state — a re-fetch never replaces populated rows. Loading is not a brand moment; a cold-start animation would be a separate decision.

## Consequences
- Uncertainty is expressed structurally, never editorially.
- Most loads show nothing at all.
