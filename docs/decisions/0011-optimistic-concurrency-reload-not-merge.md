---
status: accepted
date: 2026-08-01
deciders: [Nick]
type: design
supersedes:
---
# Shared lineup editing uses a per-war-day revision; stale saves fail and the user reloads

## Context
Two leaders may edit the same day's lineup. Alternatives: last-write-wins; automatic merge of drag-and-drop edits; pessimistic locks. Resolved in the lineup-planning map.

## Decision
Each war day carries a revision. The server accepts a save only when the submitted revision matches the current unlocked row; a successful save, a lock, and an unlock each advance it. A stale save fails without overwriting; the UI shows that the lineup changed (latest actor and time when known) and prompts a reload. Unsaved edits are not merged. The daily lock is a separate per-day edit guard any leader or admin may set or clear, with actor and timestamp recorded.

## Consequences
- Conflicts are visible and cheap; there is no merge code to get wrong.
- Lineup History records lock/unlock events, not individual moves (0009).
