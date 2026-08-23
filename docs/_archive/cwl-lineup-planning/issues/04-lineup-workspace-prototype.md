> Archived 2026-08-23 — CWL lineup-planning map (2026-07/08), resolved; durable choices are decision records 0009–0011. History only.

Type: prototype
Status: resolved
Resolved by: 01, 03

## Question

What should the renamed CWL operations workspace look and feel like for reviewing interest, availability, recommendations, manual drag-and-drop lineup planning, comments, locking, and the difference between planned and observed assignments?

## Answer

- Lock in Variant A — Command center — as the UI direction for implementation. It provides the clearest daily operating surface: day selection, planned lineup, substitute pool, recommendation explanation, lock state, and planned-versus-observed context in one workspace.
- Bring Variant B's attack evidence into the A member cards. Each card exposes Town Hall, assigned-attack completion, and CWL stars without requiring a separate roster review surface.
- Manage availability inline as a compact three-state control (`available`, `unknown`, `unavailable`) on lineup and substitute cards. Changing availability never automatically changes lineup membership, and availability remains editable while a daily lineup is locked.
- Availability remains season-scoped: it persists until a leader changes it, then members without a row are treated as `unknown` when a new CWL season is created. The existing Availability route may remain as a fallback during rollout, but the CWL workspace is the primary leader workflow. Availability changes remain separate from lineup-plan changes.
- Replace the shared-handoff/Discord concept with an in-app Lineup History summary. Show the latest 3–5 operational events and provide an expanded all-updates view when needed. This is an operational summary, not a full drag-event archive or planned-versus-actual historical store.
- Planned lineups are initialized from the prior day by default. Once a daily plan exists, it remains independent; re-inheritance is an explicit reset action.
- Keep the human approval boundary: recommendations preview changes, leaders make or save the plan, and nothing changes in-game automatically.

The prototype settles the product direction. Recommendations remain previews and do not require a separate leader-decision record in the lineup workspace. Lineup History retains initialization, saves with before-and-after lineup tags, re-inheritance, lock changes, and observed API refresh summaries; it does not retain individual drag movements.
