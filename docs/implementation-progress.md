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
| 9. UnRaid deployment and operator runbook | In progress | Deployment authorized; local assets, safety hardening, and read-only preflight complete; remote deployment, idempotency, and rollback remain. |
| 10. End-to-end acceptance and production handoff | Not started | Depends on Tasks 7–9. |

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
- `git diff --check`: passed.

## Continuation Point

Task 9 is in progress on `codex/cwl-assistant-mvp`. Local deployment assets and the read-only UnRaid preflight are complete. No remote files, images, networks, containers, Clash keys, or Supabase data were changed.

- `deploy/unraid/docker-compose.yml` defines one non-root, read-only, capability-free collector with no published ports or persistent data mount.
- The collector sends current `sb_secret_...` credentials only as an API key, retains legacy JWT `service_role` compatibility, and rejects browser/personal/unrecognized credentials before network access.
- `deploy/unraid/collector.env.example` separates the five required secrets/settings from validated optional log-level and cadence overrides.
- `scripts/verify-collector.sh` sanitizes recent logs, reuses the collector's Supabase header compatibility, and checks container health, Clash/Supabase connectivity, raw freshness, completed-run identity, canonical counts, collection health, and duplicate canonical identities.
- `docs/runbooks/unraid.md` documents SSH and UnRaid UI deployment, WAN-IP/key verification, idempotency checks, and data-preserving rollback.
- Read-only preflight found the documented server reachable with the required architecture, timezone, Docker/Compose support, free app-data space, outbound HTTPS, and no collector name/path conflicts.

Nick authorized the documented Task 9 remote writes and intended Supabase collection writes. Next: perform Task 9 Steps 5–7, run two retry-idempotency collections, verify first-deployment rollback/no exposed port, and commit the final checkpoint. Production Supabase is an external prerequisite for a healthy live collector; Pages is not required for collector health.
