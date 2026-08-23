> Archived 2026-08-23 — CWL lineup-planning map (2026-07/08), resolved; durable choices are decision records 0009–0011. History only.

Type: grilling
Status: claimed
Blocked by: 01

## Question

What minimal ownership, timestamps, audit events, and leader/admin permissions are required for shared lineup planning to remain understandable and safe when multiple leaders edit the workspace, without adding an in-app comment system?

## Comments

- Decision so far: retain compact operational events for initialization, saves, re-inheritance, lock changes, and observed API refresh summaries; do not retain every drag-and-drop edit.
- Proposed concurrency rule: use optimistic concurrency with a small per-day lineup revision. A save must include the revision loaded by the user and must fail safely if another user has saved or locked the lineup since then. Do not silently use last-write-wins.

## Answer

Shared editing uses optimistic concurrency with a per-war-day revision. Leaders and admins may edit, lock, and unlock a lineup, but the server accepts a save only when the submitted revision still matches the current unlocked row. A successful save advances the revision; locking and unlocking also advance it. Stale saves fail without overwriting the current plan.

The UI shows that the lineup changed, identifies the latest actor and timestamp when available, and prompts the user to reload the latest lineup. It does not attempt automatic conflict resolution or merge unsaved drag-and-drop edits. The app retains compact operational events for the Lineup History summary, not every lineup movement.

Status: resolved
