# CWL Operations Assistant Implementation Progress

Last updated: 2026-07-12

| Task | Status | Notes |
| --- | --- | --- |
| 1. Repository foundation and domain contracts | Complete | Implemented and reviewed. |
| 2. Supabase schema and authorization | Complete | Live migration reset and RLS pgTAP tests verified. |
| 3. Clash client and raw collection | Complete | Implemented and covered by collector tests. |
| 4. Canonical normalization and retry idempotency | Complete | Atomic normalization and retry behavior implemented. |
| 5. Derived metrics and recommendation strategy | Complete | Explainable ordered-rules strategy implemented and reviewed. |
| 6. Collector scheduling, health, and Docker packaging | Complete | Lease heartbeat and safety watchdog, abort propagation, health checks, and container packaging verified. |
| 7. Authenticated dashboard and progressive-disclosure UX | In progress | Design approved; tested UI shell, KPIs, grouped actions, access boundaries, auth helpers, availability editor, admin shell, warnings, and Vite entry point implemented. Live Supabase wiring and E2E remain. |
| 8. GitHub Pages and Supabase production configuration | Not started | Depends on Task 7. |
| 9. UnRaid deployment and operator runbook | Not started | Requires explicit authorization before remote writes. |
| 10. End-to-end acceptance and production handoff | Not started | Depends on Tasks 7–9. |

## Latest Verification

- `pnpm --filter @cwl/web test`: 14 tests passed across 5 files.
- `pnpm --filter @cwl/web typecheck`: passed.
- `pnpm --filter @cwl/web build`: Vite production build passed.
- `pnpm test`: 59 tests passed.
- `pnpm typecheck`: all four workspace packages passed.
- `supabase db reset`: all six migrations applied successfully.
- `supabase test db`: 45 tests passed across both pgTAP files.
- `docker build -f docker/collector.Dockerfile -t cwl-collector:test .`: passed.
- Docker inspection: image runs as `node` and defines the collector health check.
- `git diff --check`: passed.

## Continuation Point

Continue Task 7 in `docs/superpowers/plans/2026-07-11-cwl-ops-assistant.md` on `codex/cwl-assistant-mvp`; do not create a worktree. The approved visual direction is recorded in `docs/superpowers/specs/2026-07-11-cwl-ops-assistant-design.md`, and `DESIGN-notion.md` is the CSS source of truth.

Task 7 implementation commits from this session: `8a7491a`, `cd684ba`, `52af195`, `109dbb6`, `733c3cd`, `6069f6a`, `7e6f346`, `eec87ec`, and `28effb8`.

- Functional KPI dashboard with API-derived countdown, attacks-used progress, availability and eight-star metrics.
- Grouped `Remove these members` / `Add these members` actions with progressive `Why?` disclosure.
- Notion-derived responsive styling, signed-out and leader/admin boundaries, Discord OAuth helpers, invitation redemption, availability editing, admin access UI, warnings, empty state, approve/edit callbacks, and a runnable Vite entry point.

Next, implement live Supabase client/session state, profile-role lookup, revoked/unauthorized handling, exactly-once callback redemption, dashboard queries and model mapping. Add the missing loading/unknown-contact tests, Playwright desktop/mobile workflow, and full Task 7 verification. Preview with `pnpm --filter @cwl/web exec vite --host 127.0.0.1`; opening `apps/web/index.html` directly with `file://` is unsupported and appears blank because Vite must resolve the module graph.
