> Archived 2026-08-23 — CWL lineup-planning map (2026-07/08), resolved; durable choices are decision records 0009–0011. History only.

Type: grilling
Status: claimed

## Question

What are the canonical states and transitions for a member across interest, availability, planned lineup, recommendation, lock, and observed in-game assignment? Establish vocabulary that keeps member intent, leader intent, recommendation state, and API facts distinct.

## Comments

- Decision so far: do not create separate season-level `requested` and `available` statuses. A member marked `available` has expressed interest and is expected to participate for the whole CWL until a leader changes the status. `unknown` means no response; `unavailable` means the member cannot or does not want to participate.
- Decision so far: planned lineups are managed independently for each war day, with each day initially inheriting the prior day’s planned lineup.
- Decision so far: each inherited daily lineup becomes an independent snapshot. Later edits to an earlier day must not silently mutate a later day; any re-inheritance should be an explicit action.
- Decision so far: availability is season-scoped. It persists for the entire CWL until a leader changes it, and a missing availability row is interpreted as `unknown`; prior-season rows are never carried forward.

## Answer

The canonical model stays intentionally small:

- Season-level participation uses `unknown`, `available`, or `unavailable`. `available` persists for the whole CWL until changed.
- A new CWL season treats every member without an availability row as `unknown`; no prior-season availability is copied automatically, and explicit default rows are not required.
- Each war day has an independent planned lineup initialized from the previous day. Re-inheritance is explicit and earlier-day edits do not cascade.
- The planned lineup is operational state for the active season, not a second historical source of truth.
- The Clash API remains authoritative for the observed in-game lineup and results.
- Do not retain inter-day movement history or build a separate planned-versus-actual archive for the first version. Keep only the current operational plan plus minimal lock/audit metadata needed for shared use during CWL; cleanup after the season can remove the planning state.

The value of planned-versus-actual history would be post-CWL analysis, leader accountability, or explaining why an approved recommendation changed. Those are not required strongly enough for this first August workflow to justify the additional data model.

Status: resolved
