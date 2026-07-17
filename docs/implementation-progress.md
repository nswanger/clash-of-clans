# CWL Operations Assistant Implementation Progress

Last updated: 2026-07-16

| Task | Status | Notes |
| --- | --- | --- |
| 1. Repository foundation and domain contracts | Complete | Implemented and reviewed. |
| 2. Supabase schema and authorization | Complete | Live migration reset and RLS pgTAP tests verified. |
| 3. Clash client and raw collection | Complete | Implemented and covered by collector tests. |
| 4. Canonical normalization and retry idempotency | Complete | Atomic normalization and retry behavior implemented. |
| 5. Derived metrics and recommendation strategy | Complete | Explainable ordered-rules strategy implemented and reviewed. |
| 6. Collector scheduling, health, and Docker packaging | Complete | Lease heartbeat and safety watchdog, abort propagation, health checks, and container packaging verified. |
| 7. Authenticated dashboard and progressive-disclosure UX | Complete | Base-aware Discord auth, secure invitation redemption, guarded routes, live Supabase reads/mutations, explainable decisions, responsive states, and E2E coverage verified. |
| 8. GitHub Pages and Supabase production configuration | Complete | Pages-safe base routing, verified deployment workflow, public-only build configuration, artifact secret scan, and production Supabase runbook implemented and reviewed. |
| 9. UnRaid deployment and operator runbook | Complete | Immutable collector deployed to UnRaid; protected configuration, live verification, two-restart idempotency, rollback, restoration, and no-port checks passed. |
| 10. End-to-end acceptance and production handoff | Not started | Ready to begin; Tasks 7–9 are complete. |

## Latest Verification

- `pnpm --filter @cwl/web test`: 48 tests passed across 11 files.
- `pnpm --filter @cwl/web typecheck`: passed.
- `pnpm --filter @cwl/web build`: Vite production build passed.
- `pnpm test`: 127 Vitest tests passed across the collector, domain, recommendations, and web packages; the verification-script shell suite also passed.
- `pnpm typecheck`: all five workspace packages passed.
- `pnpm build`: all five workspace packages passed.
- Root and repository Pages builds emitted the expected `/assets/` and `/clash-of-clans/assets/` URLs.
- `.github/workflows/deploy-pages.yml`: YAML structure and required build/deploy jobs verified.
- Pages artifact scan: zero collector-only secret names or `sb_secret_` prefixes found.
- `supabase db reset`: all six migrations applied successfully.
- `supabase test db`: 55 tests passed across four pgTAP files.
- `pnpm exec playwright test`: 14 desktop, tablet-width, and mobile workflows passed.
- `docker build -f docker/collector.Dockerfile -t cwl-collector:test .`: passed.
- Docker inspection: image runs as `node` and defines the collector health check.
- Task 9 collector tests: 59 tests passed; current/legacy Supabase server credentials, legacy role verification, invalid credential rejection, optional logging/cadence overrides, and health thresholds are covered.
- `scripts/tests/verify-collector.test.sh`: healthy, unhealthy, duplicate-identity, completed-run evidence, Supabase header compatibility, expected idle-CWL partial, unexpected partial, and expanded secret-redaction cases passed.
- UnRaid Compose rendering: non-root read-only service, no ports or volumes, dropped capabilities, isolated bridge, and health check verified.
- Read-only UnRaid preflight: SSH, `x86_64`, timezone, Docker 29.5.1, Compose, app-data space, outbound HTTPS, and name/path conflicts checked without remote writes.
- Read-only credential preflight: required local variables, modern Supabase server key and browser key formats, linked-project match, Supabase REST access, Clash clan access, and production migration dry-run all passed without printing credential values.
- UnRaid deployment: immutable `linux/amd64` image `cwl-collector:bbfe29f3d3cb` loaded from a matching archive digest; app-data directory mode `700`, environment mode `600`, non-root read-only runtime, and `restart: unless-stopped` verified.
- Production collection: Clash and Supabase connectivity passed; the only partial attempt was the expected idle-CWL league-group `404 not_found`, with complete healthy clan/member/player attempts and zero duplicate canonical identities.
- Two-restart idempotency: both restarts produced distinct completed collection-run IDs; canonical CWL war/member counts stayed stable at `0`; duplicate canonical identities stayed `0`.
- Data-preserving rollback: the prior immutable image was restored and verified, then `cwl-collector:bbfe29f3d3cb` was restored as the final running image; counts stayed stable and no Supabase data was deleted.
- `docker port cwl-collector`: no published ports before, during, or after rollback.
- `git diff --check`: passed.

## Continuation Point

Task 9 is complete on `codex/cwl-assistant-mvp`. UnRaid is running immutable image `cwl-collector:bbfe29f3d3cb` with protected configuration under `/mnt/user/appdata/cwl-collector` and no published ports.

- `deploy/unraid/docker-compose.yml` defines one non-root, read-only, capability-free collector with no published ports or persistent data mount.
- The collector sends current `sb_secret_...` credentials only as an API key, retains legacy JWT `service_role` compatibility, and rejects browser/personal/unrecognized credentials before network access.
- `deploy/unraid/collector.env.example` separates the five required secrets/settings from validated optional log-level and cadence overrides.
- `scripts/verify-collector.sh` sanitizes recent logs, reuses the collector's Supabase header compatibility, checks complete player-attempt coverage for expected idle-CWL partial runs, and verifies container health, connectivity, raw freshness, completed-run identity, canonical counts, collection health, and duplicate canonical identities.
- `docs/runbooks/unraid.md` documents SSH and UnRaid UI deployment, WAN-IP/key verification, idempotency checks, and data-preserving rollback.
- Two restart collections and the rollback/restoration collection each produced distinct completed runs without canonical count inflation or duplicate identities.
- The prior image selector remains protected as `.env.rollback-task9`; the final active selector points to `cwl-collector:bbfe29f3d3cb`.

Next: begin Task 10 end-to-end production acceptance and handoff. Production Supabase and the UnRaid collector are live; Pages acceptance remains part of Task 10.
