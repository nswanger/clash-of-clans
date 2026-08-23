# Year-Round Clan Management Roadmap

## Product direction

Expand the CWL Operations Assistant into a year-round clan-management tool while preserving the current CWL decision workflow. New work should improve a real leader decision, make data quality visible, and keep human approval for lineup and membership decisions.

Pending work, including the live-CWL acceptance gate, is tracked in GitHub Issues; this document holds only direction and the rules for ranking work.

## Prioritization rules

Rank work using these questions, in order:

1. Which recurring clan decision becomes easier or more trustworthy?
2. Is the work time-sensitive for the next CWL or a recurring clan-management cycle?
3. Does the required data already exist, or must it be collected and normalized first?
4. Can the result be explained and audited without overstating uncertain signals?
5. Does the slice deliver usable value through the backend and UI together?
6. Will the work create a foundation for multiple later features?

Prefer complete vertical slices over a general backend-first or frontend-first sequence. Do a short data-feasibility check first when API availability is uncertain. Introduce UI structure as the corresponding workflows are added rather than performing a disconnected visual rewrite.

## Verified Clash API boundary

The live API currently provides useful member-list fields including clan role, clan rank, previous clan rank, Town Hall level, trophies, league, donations, and donations received. Player profiles add war preference, war stars, attack and defense wins, Clan Capital contributions, achievements, heroes, troops, spells, and equipment.

The API does **not** provide a direct last-active timestamp. The product must not label an inferred value as "last active." Instead, repeated snapshots can support an **activity observed** indicator based on changes such as:

- Donations and donations received
- Attack-win and defense-win counters
- Clan Capital contribution changes
- Relevant achievement progress, including Clan Games progress when useful
- Trophy, league, or progression changes
- Roster presence and role changes

These signals have different reset schedules and confidence levels. The UI should show the evidence and observation window, handle counter resets, and distinguish "no observed change" from "inactive."

The official API still does not provide clan chat, in-game signup responses, direct messages, or informal availability responses. Those remain leader-entered or require a separate member-facing input channel.

## Explicit non-goals

- A fabricated or inferred "last active" timestamp
- A black-box activity score
- Automatic promotion, demotion, benching, or lineup approval
- Feeding unvalidated year-round activity metrics into CWL recommendations
- A visual re-theme without a corresponding workflow improvement
- Indefinite retention of every raw API response
