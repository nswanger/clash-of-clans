# CWL Operations Assistant Implementation Progress

Last updated: 2026-07-20

Post-MVP priorities are tracked in [Year-Round Clan Management Roadmap](./year-round-clan-management-roadmap.md). Access-management hardening is the current delivery item.

Post-MVP Priority 1 is deployed. Priority 2 is implemented locally: protected access mutations, invitation lifecycle history, one-time copy/reissue links, role demotion and revocation, self-lockout/final-admin guards, recoverable UI actions, and access audit visibility. Production migration and deployed UI acceptance remain.

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
| 10. End-to-end acceptance and production handoff | In progress | Pages publication, Discord OAuth, Nick's admin bootstrap, the useful idle-CWL overview, production recommendation persistence, automatic auditing, cleanup scheduling, UnRaid replacement, and local verification are complete. Only live acceptance during the next active CWL remains. |

## Latest Verification

- `pnpm --filter @cwl/web test`: 67 tests passed across 14 files, including access snapshot loading, invitation lifecycle actions, role changes, confirmations, retries, and audit presentation.
- `pnpm --filter @cwl/web typecheck`: passed.
- `pnpm --filter @cwl/web build`: Vite production build passed.
- `pnpm test`: 162 Vitest tests passed across the collector, domain, recommendations, and web packages; the verification-script shell suite also passed.
- `pnpm typecheck`: all five workspace packages passed.
- `pnpm build`: all five workspace packages passed.
- Root and repository Pages builds emitted the expected `/assets/` and `/clash-of-clans/assets/` URLs.
- `.github/workflows/deploy-pages.yml`: YAML structure and required build/deploy jobs verified.
- Pages artifact scan: zero collector-only secret names or `sb_secret_` prefixes found.
- `supabase db reset`: all 13 migrations applied successfully.
- `supabase test db`: 148 tests passed across nine pgTAP files, including protected access mutations, invitation lifecycle, audit safety, and lockout guards.
- `supabase db lint --level warning`: no schema errors.
- `pnpm exec playwright test`: 18 desktop, tablet-width, and mobile workflows passed, including manual regeneration without a leader-decision mutation.
- `docker build -f docker/collector.Dockerfile -t cwl-collector:acceptance .`: passed.
- Docker inspection: image runs as `node` and defines the collector health check.
- Task 9 collector tests: 59 tests passed; current/legacy Supabase server credentials, legacy role verification, invalid credential rejection, optional logging/cadence overrides, and health thresholds are covered.
- `scripts/tests/verify-collector.test.sh`: healthy, unhealthy, duplicate-identity, completed-run evidence, Supabase header compatibility, expected idle-CWL partial, unexpected partial, and expanded secret-redaction cases passed.
- UnRaid Compose rendering: non-root read-only service, no ports or volumes, dropped capabilities, isolated bridge, and health check verified.
- Read-only UnRaid preflight: SSH, `x86_64`, timezone, Docker 29.5.1, Compose, app-data space, outbound HTTPS, and name/path conflicts checked without remote writes.
- Read-only credential preflight: required local variables, modern Supabase server key and browser key formats, linked-project match, Supabase REST access, Clash clan access, and production migration dry-run all passed without printing credential values.
- UnRaid deployment: immutable `linux/amd64` image `cwl-collector:207283a21d08` loaded from a committed archive; app-data directory mode `700`, environment mode `600`, non-root read-only runtime, and `restart: unless-stopped` verified.
- Production collection: Clash and Supabase connectivity passed; the only partial attempt was the expected idle-CWL league-group `404 not_found`, with complete healthy clan/member/player attempts and zero duplicate canonical identities.
- Authenticated production smoke: the idle-CWL overview shows `Line Em Up`, current collection freshness, and 44 current members; the `Access` route loads Nick as `admin`; the browser reports no console warnings or errors.
- Authenticated manual-regeneration smoke: the Pages control successfully invokes the production Edge Function and reports the expected idle-CWL no-context result without creating a leader decision.
- Two-restart idempotency: both restarts produced distinct completed collection-run IDs; canonical CWL war/member counts stayed stable at `0`; duplicate canonical identities stayed `0`.
- Task 9 data-preserving rollback: the prior immutable image was restored and verified, then `cwl-collector:bbfe29f3d3cb` was restored; counts stayed stable and no Supabase data was deleted. The Task 10 backend replacement advanced the running image to `cwl-collector:207283a21d08`.
- Production recommendation backend: the shared ordered-rules writer, idempotent versioned persistence RPC, post-collection generation, and leader-authorized manual Edge Function are deployed. The Pages control is locally and production verified with loading, current/success, idle-CWL, and error states.
- Production audit backend: six database triggers append events for invitation, role, availability, recommendation-generation, and recommendation-decision changes; direct audit-table mutation is revoked.
- Production retention: `purge-expired-raw-snapshots` is active in Supabase Cron at `17 3 * * *` UTC and calls only `purge_expired_raw_snapshots()`.
- `docker port cwl-collector`: no published ports before, during, or after rollback.
- `git diff --check`: passed.

## Continuation Point

Task 10 remains calendar-blocked for active-CWL acceptance. Priority 2 is implemented on `codex/access-management-hardening`; migration `202607200013` and its Pages build are not yet deployed. GitHub Pages serves the current production build at `https://nswanger.github.io/clash-of-clans/`. UnRaid runs the healthy member-history collector with protected configuration under `/mnt/user/appdata/cwl-collector` and no published ports.

- Fixture acceptance covers raw collection, canonical normalization, availability, recommendation generation and explanations, approval/override behavior, error detection, and accessibility.
- The production collector now resolves a stable raw-snapshot identity, normalizes each successful snapshot, and classifies normalization failures as `normalization_error` before dependent CWL collection continues.
- `README.md` distinguishes GitHub Pages, Supabase, and UnRaid responsibilities and documents the actual browser and collector environment variable names.
- `docs/runbooks/operations.md` covers monthly operation, recovery, and application-role promotion to admin while preserving human approval for clan-policy decisions.
- The local chain passes: Supabase reset and 88 pgTAP checks, workspace typecheck, 148 tests plus collector verification scripts, production build, 18 Playwright scenarios, and the committed `linux/amd64` collector image build.
- The production Pages asset path, signed-out route, anonymous role denial, anonymous profile isolation, Discord OAuth redirect, Nick's stored `admin` role, collection freshness, expected idle-CWL partial state, collector health, and zero published ports are verified.
- The production collector has raw clan and roster data, while canonical CWL tables correctly remain empty because CWL is inactive. The deployed dashboard carries raw clan members and collection health through the no-season state and presents an explicit clan overview.
- Automatic recommendations run only after a finalized active-CWL collection. The authenticated dashboard exposes the deployed manual-regeneration function without calling approval or override paths.
- No real recommendation was approved or overridden.

One live-acceptance gate remains:

1. During the next active CWL, verify nonzero canonical normalization, availability entry, recommendation generation, human approval or override, audit visibility, and retry idempotency. Obtain Nick's explicit choice before approving or overriding a real recommendation.
