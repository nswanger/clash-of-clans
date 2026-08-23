---
status: accepted
date: 2026-08-16
deciders: [Nick]
type: design
supersedes:
---
# One original dragon mark, badge variant by transform, once per screen, never carrying a state colour

## Context
The app needed a mark for the top bar, favicon, and empty states. Alternatives: two separate marks; a wyvern displayed; an illustration style; Supercell-derived art (this repo is public). Locked in [#24](https://github.com/nswanger/clash-of-clans/issues/24), placement amended by [#58](https://github.com/nswanger/clash-of-clans/issues/58); reference `design/prototype/identity.html`.

## Decision
One mark — a dragon's head cabossed — with a shield badge variant generated from it by transform at 16–32px. All geometry is original. Permitted: the top bar at 24px once per screen, standing alone with no product name beside it (#58 — the primary nav is the page name, so the only bar names the page); the favicon and app icon; empty states muted to a neutral. Forbidden: on rows, as a watermark, as texture, or carrying a state colour. No illustration style beyond the mark.

## Consequences
- The product name appears only on the auth shell.
- A coloured mark would be a sixth semantic mark (0014); identity never states an evaluation.
- Refining the vector does not reopen the decision.
