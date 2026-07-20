# Year-Round Clan Management Roadmap

Last updated: 2026-07-18

## Product direction

Expand the CWL Operations Assistant into a year-round clan-management tool while preserving the current CWL decision workflow. New work should improve a real leader decision, make data quality visible, and keep human approval for lineup and membership decisions.

The product is an MVP candidate. Its only remaining MVP acceptance gate is a live verification during an active CWL; that gate is calendar-blocked and does not prevent post-MVP work.

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

## Roadmap

### Gate 0 — Active-CWL production acceptance

**Status:** Calendar-blocked; perform during the next active CWL.

Verify nonzero canonical normalization, availability entry, recommendation generation, human approval or override, audit visibility, and retry idempotency. Do not approve or override a real recommendation without Nick's explicit choice.

### Priority 1 — Member history and roster overview

**Status:** Implemented locally on 2026-07-19; production migration, collection, and UI acceptance remain.

Create an indefinitely useful, normalized history of current clan membership and selected activity counters rather than relying on 90-day raw snapshots. Deliver the data foundation and its first UI together.

The first slice should:

- Define a compact canonical daily member snapshot and retention policy.
- Reuse already collected clan-member and player-profile responses where practical.
- Preserve current values plus daily, 7-day, and 30-day deltas where the underlying metric supports them.
- Handle joins, departures, missing collections, stale data, and counter resets explicitly.
- Add a `Members` experience with current role, Town Hall, donations, war preference, roster tenure/observation dates, and explainable recent activity signals.
- Add filtering and sorting for common leader tasks such as finding low-observation members, role-review candidates, and members needing follow-up.
- Introduce the minimum navigation structure needed to separate year-round overview, members, CWL operations, availability, and admin access.
- Keep new activity signals out of recommendation scoring until enough history exists to validate their usefulness.

Before creating the migration, present Nick with the proposed canonical fields, snapshot grain, and indefinite-retention implications for approval.

Implementation now includes the approved two-table daily grain, protected collector normalization RPCs, an RLS-aware roster overview, explainable 1/7/30-day baselines, reset-aware activity evidence, separate Overview and Members routes, leader filters/sorts, and automated collector/web/database coverage. Activity remains supporting context and is not used by CWL recommendations.

### Priority 2 — Access-management hardening

The existing admin route already creates one-day invitations, lists leaders/admins, promotes leaders to admin, and revokes access. Refine it into a complete self-service workflow:

- Show invitation status and history without exposing invitation token hashes.
- Support copy, revoke, and reissue actions.
- Support admin-to-leader demotion in addition to promotion and revocation.
- Add confirmations, progress feedback, and recoverable error states.
- Prevent accidental self-lockout and removal of the last admin.
- Show the relevant access audit history.

This is mostly a focused UI and authorization slice because the core role, invitation, and audit tables already exist.

### Priority 3 — CWL readiness and decision history

Make the system easier to operate safely before and during CWL:

- Readiness checklist for freshness, active season context, availability completion, unresolved contacts, season settings, and recommendation state.
- Visible recommendation and leader-decision history.
- Human-readable audit timeline for availability, access, recommendation generation, approval, and override events.
- Clear ownership and timestamps for outstanding actions.

### Priority 4 — Post-CWL review

Turn existing CWL history into a repeatable end-of-season review:

- Participation and assigned-attack completion
- Missed attacks and follow-up candidates
- Stars and destruction per assigned opportunity, with Town Hall context
- Rotation and eight-star reward progress
- Suggested promotion, demotion, bench, or follow-up review lists with supporting evidence only
- Exportable summary for clan leadership

The tool should present candidates and tradeoffs, never automatically change in-game roles or make membership decisions.

### Priority 5 — Broader UI polish

After the main year-round workflows exist, perform a cohesive refinement pass across navigation, hierarchy, responsive behavior, empty states, tables, filters, terminology, and visual consistency. Accessibility and operational clarity remain acceptance criteria, not a final cleanup task.

### Priority 6 — Reminders and external coordination

Consider Discord or other notifications only after the underlying readiness and follow-up states are reliable. Start with leader-facing reminders for stale collection, incomplete availability, approaching war deadlines, and unresolved follow-ups. Any external messaging integration requires an explicit workflow and privacy decision before implementation.

## Additional candidates

Keep these in the later backlog until a concrete leader decision justifies them:

- Member detail pages with progression history for heroes, equipment, and Town Hall
- Roster join/leave and role-change timeline
- Configurable activity-review thresholds by observation window
- Regular-war reliability metrics, if collection coverage is dependable
- Clan Games and Clan Capital review views
- Season-over-season CWL comparisons
- CSV export for deeper ad hoc analysis
- Member-entered availability through a lightweight form or Discord workflow

## Explicit non-goals for the next slice

- A fabricated or inferred "last active" timestamp
- A black-box activity score
- Automatic promotion, demotion, benching, or lineup approval
- Feeding unvalidated year-round activity metrics into CWL recommendations
- A visual re-theme without a corresponding workflow improvement
- Indefinite retention of every raw API response

## Next-session starting point

Design and implement **Priority 1 — Member history and roster overview** using the normal development cycle.

Start by inspecting the existing collector cadence, raw clan/member/player payloads, dashboard routing, and Supabase RLS patterns. Then propose the smallest canonical daily-snapshot schema and retention approach for Nick's approval before writing a migration. The intended first release is one end-to-end slice: collection/normalization, derived recent-change signals, a useful member roster page, navigation integration, tests, and deployment verification.
