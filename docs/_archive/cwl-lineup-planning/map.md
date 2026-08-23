> Archived 2026-08-23 — CWL lineup-planning map (2026-07/08), resolved; durable choices are decision records 0009–0011. History only.

## Destination

Produce a build-ready product design and UI prototype for a leader-facing CWL lineup planning workspace. It should capture member interest and availability, support manual lineup planning and locking, preserve comments and audit history, and use verified clan-role data—including Elder status—appropriately in explainable recommendations.

## Notes

Domain: CWL operations and leader decision support.

Consult `prototype`, `domain-modeling`, `grilling`, `sql-style`, and `verification-before-completion` as the map advances. Preserve human approval for every in-game lineup or membership decision. The existing API does not provide clan-chat responses, so member interest remains leader-entered unless a separate input channel is later chosen.

## Decisions so far

- [Lineup State Model](issues/01-lineup-state-model.md) — Keep season participation, daily planned lineup, and API-observed lineup distinct; retain only active-season planning state and minimal lock/audit metadata.
- [Lock Semantics](issues/03-lock-semantics.md) — Lock is a per-war-day edit guard; leaders and admins can lock or unlock, with actor and timestamp metadata.
- [Elder Role Data Boundary](issues/02-elder-role-data-boundary.md) — Reuse current member-list role history, map API `admin` to product Elder, and expose it to recommendations only as a freshness-aware final tie-breaker.
- [Elder-Aware Recommendation Policy](issues/05-elder-aware-recommendation-policy.md) — Availability/participation creates priority; current Elder status only breaks ties among otherwise comparable eligible candidates.
- [Comments, Audit, and Permissions](issues/06-comments-audit-and-permissions.md) — Audit lock/unlock only; use revision-checked optimistic concurrency and prompt stale users to reload without merging.
- [Lineup Workspace Prototype](issues/04-lineup-workspace-prototype.md) — Variant A is the chosen implementation direction, with inline season-level availability, attack evidence on cards, and a compact Lineup History summary.

## Not yet specified

- The smallest August acceptance path and the migration/rollout boundary for the new planning state.
- The persisted planning/lock/revision schema and the exact retained event types for Lineup History.
- How recommendation preview, leader edits, approval, and saved daily plans connect in the production workspace.

## Out of scope

- Automatically changing the in-game lineup, clan roles, or membership.
- A black-box player score or an inferred “last active” value.
- Treating Elder status as an unconditional lineup guarantee.
- Adding free-form in-app comments; leader communication remains in Discord or in-game.
- Building external chat, Discord, or member self-service intake before the core leader workflow is understood.
