---
status: accepted
date: 2026-08-20
deciders: [Nick]
type: design
supersedes:
---
# Post-CWL review is one ranked list in two groups, records one fact, and has no action bar

## Context
The review phase was the first surface designed against the inventory rather than ported. Alternatives: a separate follow-up section; an editing surface with a draft; recording who received bonuses. Locked in [#54](https://github.com/nswanger/clash-of-clans/issues/54); reference `design/prototype/cwl-review.html`; phase model in 0002.

## Decision
Three decisions, one ranked list: bonus medals, role changes, and follow-ups read from opposite ends of 0001's ranking. Two groups split at the eight-star threshold, which is a rank boundary, not a bonus cutoff — the game grants a league-dependent number nothing in the schema knows, so the leader supplies the count. One fact is recorded: `cwl_seasons.bonuses_administered_at` — whether bonuses were handed out, never who got one; it is also the resting-phase marker (0002). No action bar and no draft: the state is a `cm-statuschip` in the topbar and a season-menu item. A previous season is reachable from the topbar menu, not the phase strip. Attacks used is not on the row (an unmarked row used every attack); a coverage gap is scoped to the season and the panel, not the row. No new component and no ninth icon; the summary strip is promoted to the system layer.

## Consequences
- `warLeague.id` is fetched and discarded today; a static league table could derive the bonus count later, additively.
- Every CWL view routes through `cwl_current_seasons`, so an earlier season is not queryable yet ([#56](https://github.com/nswanger/clash-of-clans/issues/56)).
