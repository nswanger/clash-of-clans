# CWL Operations Assistant Implementation Progress

Last updated: 2026-07-18

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
| 10. End-to-end acceptance and production handoff | In progress | Fixture acceptance, production normalization wiring, Pages publication, UnRaid replacement, local verification, and operations guidance are complete; Discord provider bootstrap and authenticated production acceptance remain. |

## Latest Verification

- `pnpm --filter @cwl/web test`: 49 tests passed across 11 files.
- `pnpm --filter @cwl/web typecheck`: passed.
- `pnpm --filter @cwl/web build`: Vite production build passed.
- `pnpm test`: 132 Vitest tests passed across the collector, domain, recommendations, and web packages; the verification-script shell suite also passed.
- `pnpm typecheck`: all five workspace packages passed.
- `pnpm build`: all five workspace packages passed.
- Root and repository Pages builds emitted the expected `/assets/` and `/clash-of-clans/assets/` URLs.
- `.github/workflows/deploy-pages.yml`: YAML structure and required build/deploy jobs verified.
- Pages artifact scan: zero collector-only secret names or `sb_secret_` prefixes found.
- `supabase db reset`: all eight migrations applied successfully.
- `supabase test db`: 55 tests passed across four pgTAP files.
- `pnpm exec playwright test`: 16 desktop, tablet-width, and mobile workflows passed.
- `docker build -f docker/collector.Dockerfile -t cwl-collector:acceptance .`: passed.
- Docker inspection: image runs as `node` and defines the collector health check.
- Task 9 collector tests: 59 tests passed; current/legacy Supabase server credentials, legacy role verification, invalid credential rejection, optional logging/cadence overrides, and health thresholds are covered.
- `scripts/tests/verify-collector.test.sh`: healthy, unhealthy, duplicate-identity, completed-run evidence, Supabase header compatibility, expected idle-CWL partial, unexpected partial, and expanded secret-redaction cases passed.
- UnRaid Compose rendering: non-root read-only service, no ports or volumes, dropped capabilities, isolated bridge, and health check verified.
- Read-only UnRaid preflight: SSH, `x86_64`, timezone, Docker 29.5.1, Compose, app-data space, outbound HTTPS, and name/path conflicts checked without remote writes.
- Read-only credential preflight: required local variables, modern Supabase server key and browser key formats, linked-project match, Supabase REST access, Clash clan access, and production migration dry-run all passed without printing credential values.
- UnRaid deployment: immutable `linux/amd64` image `cwl-collector:65e623102350` loaded from an archive with matching SHA-256; app-data directory mode `700`, environment mode `600`, non-root read-only runtime, and `restart: unless-stopped` verified.
- Production collection: Clash and Supabase connectivity passed; the only partial attempt was the expected idle-CWL league-group `404 not_found`, with complete healthy clan/member/player attempts and zero duplicate canonical identities.
- Two-restart idempotency: both restarts produced distinct completed collection-run IDs; canonical CWL war/member counts stayed stable at `0`; duplicate canonical identities stayed `0`.
- Task 9 data-preserving rollback: the prior immutable image was restored and verified, then `cwl-collector:bbfe29f3d3cb` was restored; counts stayed stable and no Supabase data was deleted. The later Task 10 replacement advanced the running image to `cwl-collector:65e623102350`.
- `docker port cwl-collector`: no published ports before, during, or after rollback.
- `git diff --check`: passed.

## Continuation Point

Task 10 is in progress on `codex/cwl-assistant-mvp`. Fixture acceptance and the complete local verification chain pass. GitHub Pages serves the production build at `https://nswanger.github.io/clash-of-clans/`. UnRaid runs immutable Task 10 image `cwl-collector:65e623102350` with protected configuration under `/mnt/user/appdata/cwl-collector` and no published ports.

- Fixture acceptance covers raw collection, canonical normalization, availability, recommendation generation and explanations, approval/override behavior, error detection, and accessibility.
- The production collector now resolves a stable raw-snapshot identity, normalizes each successful snapshot, and classifies normalization failures as `normalization_error` before dependent CWL collection continues.
- `README.md` distinguishes GitHub Pages, Supabase, and UnRaid responsibilities and documents the actual browser and collector environment variable names.
- `docs/runbooks/operations.md` covers monthly operation, recovery, and application-role promotion to admin while preserving human approval for clan-policy decisions.
- The local chain passes: Supabase reset and 55 pgTAP checks, workspace typecheck, 132 tests plus collector verification scripts, production build, 16 Playwright scenarios, and the `cwl-collector:acceptance` image build.
- The production Pages asset path, signed-out route, anonymous role denial, anonymous profile isolation, collection freshness, expected idle-CWL partial state, collector health, and zero published ports are verified.
- Discord sign-in is blocked by production configuration: Supabase reports that the Discord provider is not enabled, and production currently has no active `admin` or `leader` application roles. The frontend now displays OAuth startup errors instead of failing silently.
- Nonzero canonical-data verification remains deferred until active CWL. Authenticated role routing, audit visibility, and recommendation approval require Discord provider credentials plus Nick's admin bootstrap. No real recommendation was approved or overridden.

Next: enable Discord in Supabase with the Discord Client ID and Client Secret, add Nick's first application `admin` role as documented in the Supabase runbook, and repeat the authenticated smoke path. During the next active CWL, verify nonzero canonical rows and obtain Nick's explicit choice before approving or overriding a real recommendation.
