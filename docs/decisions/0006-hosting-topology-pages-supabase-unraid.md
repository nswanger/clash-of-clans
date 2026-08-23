---
status: accepted
date: 2026-07-10
deciders: [Nick]
type: structural
supersedes:
---
# Pages hosts the static app, Supabase holds data and auth, UnRaid runs an outbound-only collector

## Context
The collector needs a Clash API token and runs continuously; the app must be reachable by leaders on phones; this repo is public. Alternatives: host app and collector together on UnRaid behind an inbound port; serve everything from Supabase functions; a paid host. Recorded in the exploration notes.

## Decision
GitHub Pages serves only the static browser build (public `VITE_` config, never a credential). Supabase provides Discord auth, Postgres with RLS, RPCs, the leader-triggered recommendation function, and the raw-snapshot purge job. The collector runs as a Docker container on Nick's UnRaid host making **outbound** requests only — no inbound public traffic, no published ports — and its Clash developer key allowlists the home WAN IP, not the LAN or Tailscale address. `403 invalidIp` is surfaced as a collection-health warning rather than silently retried.

## Consequences
- The public repo and the Pages artifact can contain no server credential; CI scans for it.
- Collector deploys are by hand on UnRaid (runbook); schema must be applied before a new image starts (see 0003).
- A residential WAN IP change breaks collection until the key is updated — it is a monitored operational risk, not a design flaw.
