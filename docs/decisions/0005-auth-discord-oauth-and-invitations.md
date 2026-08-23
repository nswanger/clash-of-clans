---
status: accepted
date: 2026-07-10
deciders: [Nick]
type: design
supersedes:
---
# Access is Discord OAuth through Supabase with single-use invitation links

## Context
The app is public-hosted and leader-only. Alternatives considered: two hard-coded leader accounts; a member-facing signup page; email/password auth. The clan already coordinates on Discord and no member should have to reveal an email or real name to another leader. Recorded in the exploration notes (`docs/_archive/exploration-decisions.md`).

## Decision
Discord OAuth via Supabase is the initial provider. Nick is bootstrapped as first administrator. An admin generates a single-use, expiring invitation link (sent by Discord DM); consuming it grants the Discord account leader access. Leaders display a chosen alias. Access is modelled as users, roles, and invitations — not a fixed account list — with independent revocation and an audit trail. Authorization is separate from the provider so roles or further Supabase providers can be added without touching CWL data or recommendation logic.

## Consequences
- No member-facing signup exists; members never need Discord or any external account for availability.
- Role and invitation tables are the audit surface for access changes (hardened later, #82-era Priority 2).
- Changing provider is a Supabase config change, not a data-model change.
