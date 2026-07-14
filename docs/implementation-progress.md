# CWL Operations Assistant Implementation Progress

Last updated: 2026-07-13

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
| 9. UnRaid deployment and operator runbook | Not started | Requires explicit authorization before remote writes. |
| 10. End-to-end acceptance and production handoff | Not started | Depends on Tasks 7–9. |

## Latest Verification

- `pnpm --filter @cwl/web test`: 48 tests passed across 11 files.
- `pnpm --filter @cwl/web typecheck`: passed.
- `pnpm --filter @cwl/web build`: Vite production build passed.
- `pnpm test`: 107 tests passed across the collector, domain, recommendations, and web packages.
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
- `git diff --check`: passed.

## Continuation Point

Task 8 is complete on `codex/cwl-assistant-mvp`; continue with Task 9 without creating a worktree unless Nick requests otherwise. Task 9 may create local deployment assets and run read-only UnRaid preflight checks, but remote writes require Nick's explicit authorization after the exact proposed changes are shown.

Task 8 implementation commit: `4e8b15a`.

- `VITE_BASE_PATH` now supports both root/custom-domain and repository Pages paths.
- The Pages workflow pins Node 22, pnpm 10.13.1, and current official Pages actions; it runs the workspace gates, scans the built artifact, uploads only `apps/web/dist`, and uses the required Pages permissions/environment.
- The production Supabase runbook covers migration dry-runs/deployment, Discord OAuth callbacks and redirect allow-listing, public versus privileged keys, first-admin bootstrap, RLS checks, 90-day cleanup scheduling, and forward-only rollback.

Task 8 verification covers 107 workspace tests, all workspace typechecks/builds, root/project base builds, valid workflow YAML, a clean artifact secret scan, and independent review with no findings. Live Pages deployment, production migrations/OAuth/admin bootstrap/RLS spot checks, and the cleanup Cron job remain production actions rather than Task 8 repository changes. Next: Task 9 UnRaid deployment assets, preflight, and operator runbook.
