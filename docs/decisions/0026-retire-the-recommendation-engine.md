---
status: accepted
date: 2026-09-05
deciders: [Nick]
type: design
supersedes:
---
# The recommendation engine is retired; the lineup workspace carries its rules

[ADR 0002](0002-app-surfaces-and-cwl-phase.md) deleted `#/dashboard`, the only reader of machine recommendations and the approve/override controls, and left the pipeline behind it untouched on the grounds that restoring a reader would be a new surface's decision. Nobody made that decision in the three cycles since. Meanwhile the collector wrote a proposal on every active-CWL collection that nothing displayed, the edge function that regenerated one on demand had no caller, and the first live-CWL acceptance gate ([#82](https://github.com/nswanger/clash-of-clans/issues/82)) could not exercise "recommendation generation" or "approval or override" because there was nowhere to do either. This settles [#111](https://github.com/nswanger/clash-of-clans/issues/111).

## What it did

`ordered-rules-v3` proposed position-by-position substitutions for the current day: swap out members who were unavailable, of unknown availability, or had missed an attack; rotate out anyone at eight stars; protect the configured core; rank substitutes by attack completion this CWL, then the blended rating, then opportunity count, Town Hall fit and tie-breakers; and flag limited confidence and coverage gaps. Every reason was a structured code with an explanation, and `leader_decisions` recorded an approval or an override against a proposal.

## Why it goes rather than gets a reader

The lineup workspace already applies the same inputs where a leader is actually deciding. `sortCandidates` ranks the bench by availability, then rotation need, then rating; `needsBonusTurn` and `isBonusSecured` carry the eight-star rule as row pills and drive the Bonus priority rail; the applied-lineup checklist is the record of what the leader did. That is the product principle stated in `AGENTS.md`: recommendations are previews with visible reasons, and a human makes every decision. The workspace is that preview, one row at a time, with the reasons reduced to two pills rather than a list of codes.

A "suggested swaps" strip with the engine's fuller explanations was considered and set aside. If it is ever wanted it should be designed as a surface with its own question, not as a resurrection of the dashboard reader; and the rules it would explain are the ones the bench already ranks by, so the design question is about explanation density, not about a second rules engine.

## Decision

- `packages/recommendations`, the `regenerate-recommendations` edge function, and the collector's post-collection generation step are deleted. The collector's collection result is unchanged.
- `recommendations`, `leader_decisions`, their status enums, `get_recommendation_context`, `persist_recommendation`, `record_leader_decision`, the input-hash helpers and the two audit trigger functions are dropped by forward-fix migration. **Stored proposals and the leader decisions recorded against them are deleted with their tables.** Nick approved that loss: the decisions were never surfaced after ADR 0002 and describe cycles that are over.
- `audit_events` is untouched. Rows the retired triggers wrote (`recommendation_generated`, `recommendation_approved`, `recommendation_overridden`) remain as operational history; the table never referenced the dropped ones.
- The domain package keeps `memberFactsSchema` and `seasonSettingsSchema`, which describe canonical evidence, and loses the recommendation context, result, reason-code and leader-decision schemas, which described only the engine's contract.

## Consequences

- The operations runbook's daily checklist no longer has an "approve the recommendation" step; the daily decision is the lineup the leader saves and the checklist they work through in game.
- Retention policy shrinks to canonical history and audit events; there is no recommendation or decision history to retain.
- ADR 0002's "the pipeline itself is untouched" clause is superseded by this record. ADR 0010 (Elder as a tie-breaker) and ADR 0023 (the blended rating) described their effect on the engine's ranking; the rating and the tie-break survive as inputs to the bench ranking and the member roster, which is where those records' intent now lands.
- Restoring any machine proposal in future is a new surface decision that starts from the workspace's derivations, not from this code.
