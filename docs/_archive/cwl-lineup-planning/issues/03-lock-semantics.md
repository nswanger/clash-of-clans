> Archived 2026-08-23 — CWL lineup-planning map (2026-07/08), resolved; durable choices are decision records 0009–0011. History only.

Type: grilling
Status: resolved
Blocked by: 01

## Question

What does a locked lineup mean operationally, who can lock or unlock it, what edits remain allowed, and how should the UI communicate stale data or an attempted change after lock?

## Comments

- Working decision: `locked` is a per-war-day checkmark on the planned lineup. It prevents lineup edits until a leader explicitly unchecks it. It is not a season-wide lock and does not alter or replace the Clash API's observed lineup.
- Decision so far: no free-form in-app comments are needed for the August workflow; leaders will communicate through Discord or in-game. Keep only minimal lock/unlock actor and timestamp metadata.

## Answer

`locked` is a per-war-day edit guard on the planned lineup. It prevents lineup membership, ordering, and drag-and-drop changes until an authorized leader or admin explicitly unlocks it. Viewing API updates, recommendations, and warnings remains available while locked. Locking does not alter the observed in-game lineup.

Leaders and admins can both lock and unlock. The application records the lock state, actor, and timestamp for normal auditability, without adding free-form in-app comments.
