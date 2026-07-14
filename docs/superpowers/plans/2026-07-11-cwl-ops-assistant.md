# CWL Operations Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver an authenticated, low-maintenance CWL leader dashboard with idempotent UnRaid collection, explainable lineup recommendations, and leader-controlled approvals.

**Architecture:** Use a TypeScript workspace so the collector, recommendation engine, and React frontend share domain contracts. Supabase Postgres stores raw evidence, canonical CWL facts, leader-owned state, and audit history; a Dockerized Node collector makes outbound API calls from UnRaid; GitHub Pages hosts the static frontend.

**Tech Stack:** Node.js 22, TypeScript 5, pnpm workspaces, React 19, Vite 7, React Router 7, Supabase JS 2, PostgreSQL/Supabase CLI, Zod 4, Vitest 3, Testing Library, Playwright, Docker.

## Global Constraints

- Recommendations advise; a leader must approve or override every proposed lineup change.
- `Balanced` is the default priority mode for 15- and 30-player seasons; `Standings-first` is an explicit override.
- Defaults are `10 core + 5 rotation` for 15-player CWL and `20 core + 10 rotation` for 30-player CWL.
- Never recommend an `Unavailable` or `Unknown` member into a lineup.
- Reliability uses assigned-attack completion from the current CWL only.
- Raw API snapshots are retained for 90 days; canonical and leader-owned history is retained indefinitely.
- Every ingestion retry must be idempotent through database uniqueness constraints and upserts.
- The Clash API token and Supabase service credential must never enter frontend code, git history, or logs.
- The UnRaid collector requires outbound HTTPS only and no public inbound port.
- Regular-war collection, external alerts, and automated WAN-IP recovery are outside MVP scope.
- Use `Personal-Vault` project/session documentation as the source for UnRaid SSH connection details; never copy those sensitive values into this repository.

---

## Planned File Structure

```text
apps/
  collector/src/
    clash-client.ts          # Typed Clash API transport and error mapping
    collect.ts               # Endpoint orchestration and run lifecycle
    normalize.ts             # Raw-to-canonical database writes
    schedule.ts              # Hourly-CWL/daily-off-season scheduling decision
    main.ts                  # Container entrypoint
  collector/tests/fixtures/  # Redacted Clash API response fixtures
  web/src/
    auth/                    # Session, invitation redemption, route guards
    dashboard/               # Daily summary and health UI
    availability/            # Leader-recorded availability
    recommendations/         # Compact changes, Why view, approval/override
    admin/                   # Invitations and access management
packages/
  domain/src/                # Shared types, schemas, and reason codes
  recommendations/src/       # Strategy contract and ordered-rule strategy
  database/src/              # Supabase repository interfaces and implementations
supabase/
  migrations/                # DDL, constraints, functions, RLS, retention
  tests/                     # pgTAP authorization and idempotency tests
docs/runbooks/unraid.md       # Manual and SSH-assisted UnRaid operations
docker/collector.Dockerfile  # Reproducible collector image
```

## Task 1: Repository Foundation and Shared Domain Contracts

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `vitest.workspace.ts`
- Create: `packages/domain/package.json`
- Create: `packages/domain/src/index.ts`
- Create: `packages/domain/src/domain.ts`
- Create: `packages/domain/src/domain.test.ts`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `Availability`, `PriorityMode`, `SeasonSettings`, `RecommendationContext`, `RecommendationResult`, `ReasonCode`, and Zod schemas used by every later task.

- [ ] **Step 1: Add the workspace manifests and ignore generated/local state**

```json
{
  "name": "cwl-ops-assistant",
  "private": true,
  "packageManager": "pnpm@10.13.1",
  "engines": { "node": ">=22" },
  "scripts": {
    "typecheck": "pnpm -r typecheck",
    "test": "pnpm -r test",
    "build": "pnpm -r build"
  },
  "devDependencies": {
    "typescript": "^5.8.3",
    "vitest": "^3.2.4"
  }
}
```

Create `pnpm-workspace.yaml` with `packages: ["apps/*", "packages/*"]`; create strict shared TypeScript settings targeting ES2023. Add `.env*`, `!.env.example`, `node_modules/`, `dist/`, `coverage/`, `playwright-report/`, `test-results/`, `.superpowers/`, and `.DS_Store` to `.gitignore` while preserving existing entries.

- [ ] **Step 2: Write failing domain-schema tests**

```ts
import { describe, expect, it } from "vitest";
import { seasonSettingsSchema } from "./domain";

describe("seasonSettingsSchema", () => {
  it("defaults a casual 15-player season", () => {
    expect(seasonSettingsSchema.parse({ warSize: 15 })).toMatchObject({
      targetCoreSize: 10,
      rotationPositions: 5,
      priorityMode: "balanced",
      eightStarRotationEnabled: true,
    });
  });

  it("rejects core and rotation counts that do not fill the lineup", () => {
    expect(() => seasonSettingsSchema.parse({
      warSize: 30,
      targetCoreSize: 25,
      rotationPositions: 10,
    })).toThrow();
  });
});
```

- [ ] **Step 3: Run the domain test and verify failure**

Run: `pnpm install && pnpm --filter @cwl/domain test`

Expected: FAIL because `seasonSettingsSchema` does not exist.

- [ ] **Step 4: Implement the shared contracts and schemas**

Define literal unions for availability and priority mode; branded string aliases for player, clan, war, and season tags; season-setting validation; member opportunity/reliability facts; lineup membership; structured reasons; recommendation changes; contacts; coverage gaps; and collection health. Export them only through `packages/domain/src/index.ts`.

```ts
export const availabilitySchema = z.enum(["available", "unavailable", "unknown"]);
export const priorityModeSchema = z.enum(["balanced", "standings_first"]);
export const seasonSettingsSchema = z.object({
  warSize: z.union([z.literal(15), z.literal(30)]),
  targetCoreSize: z.number().int().positive().optional(),
  rotationPositions: z.number().int().nonnegative().optional(),
  priorityMode: priorityModeSchema.default("balanced"),
  eightStarRotationEnabled: z.boolean().default(true),
}).transform((value) => {
  const targetCoreSize = value.targetCoreSize ?? (value.warSize === 15 ? 10 : 20);
  const rotationPositions = value.rotationPositions ?? (value.warSize === 15 ? 5 : 10);
  if (targetCoreSize + rotationPositions !== value.warSize) {
    throw new Error("Core and rotation positions must equal war size");
  }
  return { ...value, targetCoreSize, rotationPositions };
});
```

- [ ] **Step 5: Verify and commit**

Run: `pnpm --filter @cwl/domain test && pnpm --filter @cwl/domain typecheck`

Expected: all domain tests pass and TypeScript exits 0.

Commit: `git commit -m "chore: establish TypeScript workspace and domain contracts"`

## Task 2: Supabase Schema, Integrity Constraints, and Authorization

**Files:**
- Create: `supabase/config.toml`
- Create: `supabase/migrations/202607110001_core_schema.sql`
- Create: `supabase/migrations/202607110002_rls.sql`
- Create: `supabase/migrations/202607110003_retention.sql`
- Create: `supabase/tests/schema_idempotency_test.sql`
- Create: `supabase/tests/rls_test.sql`
- Create: `.env.example`

**Interfaces:**
- Consumes: canonical identities from `@cwl/domain`.
- Produces: tables and RLS policies consumed by collector repositories and the frontend.

- [ ] **Step 1: Write failing pgTAP tests for canonical uniqueness**

Assert unique constraints for `(clan_tag, season_id)`, `war_tag`, `(war_tag, player_tag)`, `(war_tag, attacker_tag, attack_order)`, `(endpoint, request_identity, content_sha256)`, and invitation token hash. Insert the same canonical attack twice with `ON CONFLICT DO UPDATE` and assert exactly one row remains.

```sql
select lives_ok($$
  insert into cwl_attacks (war_tag, attacker_tag, attack_order, stars, destruction)
  values ('#WAR', '#PLAYER', 1, 2, 77.5)
  on conflict (war_tag, attacker_tag, attack_order)
  do update set stars = excluded.stars, destruction = excluded.destruction
$$, 'canonical attack upsert is retry-safe');

select is(
  (select count(*) from cwl_attacks where war_tag = '#WAR' and attacker_tag = '#PLAYER'),
  1::bigint,
  'retry does not duplicate attacks'
);
```

- [ ] **Step 2: Run migrations/tests and verify failure**

Run: `supabase start && supabase test db`

Expected: FAIL because core tables and policies do not exist.

- [ ] **Step 3: Implement normalized DDL and constraints**

Create focused tables for profiles, roles, invitations, seasons, members, wars, war members, attacks, raw snapshots, collection runs/attempts, availability, recommendations, decisions, and audit events. Use foreign keys, checks, UTC timestamps, immutable natural identities, and generated UUID primary keys where a natural key is unsuitable. Store recommendation input/output as versioned JSONB alongside queryable status and actor columns.

- [ ] **Step 4: Implement RLS and invitation redemption**

Create `admin` and `leader` role checks from `user_roles`; permit authenticated leaders to read operational data and write availability/decisions; restrict invitation and role management to admins. Implement a security-definer `redeem_invitation(token text)` function that hashes the token, verifies unused/unexpired state, assigns `leader`, and marks the invitation used atomically.

- [ ] **Step 5: Add raw-snapshot retention function**

Create `purge_expired_raw_snapshots()` deleting snapshots older than 90 days without touching canonical facts. Do not schedule it in local migrations; document Supabase Cron enablement for deployment.

- [ ] **Step 6: Verify and commit**

Run: `supabase db reset && supabase test db`

Expected: all pgTAP schema, idempotency, invitation, and RLS tests pass.

Commit: `git commit -m "feat: add Supabase schema and authorization"`

## Task 3: Clash Client and Raw Collection

**Files:**
- Create: `apps/collector/package.json`
- Create: `apps/collector/src/config.ts`
- Create: `apps/collector/src/clash-client.ts`
- Create: `apps/collector/src/raw-snapshots.ts`
- Create: `apps/collector/src/collect.ts`
- Create: `apps/collector/tests/clash-client.test.ts`
- Create: `apps/collector/tests/collect.test.ts`
- Create: `apps/collector/tests/fixtures/*.json`

**Interfaces:**
- Produces: `ClashClient.getClan`, `getMembers`, `getPlayer`, `getLeagueGroup`, and `getLeagueWar`; `collectOnce(dependencies): Promise<CollectionSummary>`.

- [ ] **Step 1: Add redacted fixtures and failing HTTP/error tests**

Test percent-encoded tags, authorization headers, JSON parsing, `403 invalidIp` mapping, rate-limit mapping, and absent/incomplete CWL responses. Fixtures must use fake tags and names.

```ts
it("maps invalidIp without leaking the token", async () => {
  server.use(http.get("*/v1/clans/:tag", () =>
    HttpResponse.json({ reason: "accessDenied.invalidIp" }, { status: 403 })
  ));
  await expect(client.getClan("#FAKE")).rejects.toMatchObject({ code: "invalid_ip" });
  expect(capturedLogs.join(" ")).not.toContain("secret-token");
});
```

- [ ] **Step 2: Run collector tests and verify failure**

Run: `pnpm --filter @cwl/collector test`

Expected: FAIL because client and collector modules do not exist.

- [ ] **Step 3: Implement validated configuration and typed client**

Require `CLASH_API_TOKEN`, `CLAN_TAG`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `TZ`. Use a single fetch wrapper with timeout, response validation, typed error categories, and log redaction.

- [ ] **Step 4: Implement raw-first collection orchestration**

For each endpoint, create an attempt record and persist the exact response plus SHA-256 fingerprint before normalization. Capture league war tags whenever returned. Return a summary containing successful endpoints, failed endpoints, error categories, and last-fresh timestamp; do not abort successful sibling endpoint writes after one failure.

- [ ] **Step 5: Verify and commit**

Run: `pnpm --filter @cwl/collector test && pnpm --filter @cwl/collector typecheck`

Expected: all client, redaction, raw-first, and partial-failure tests pass.

Commit: `git commit -m "feat: collect raw Clash API snapshots"`

## Task 4: Canonical Normalization and Retry Idempotency

**Files:**
- Create: `packages/database/package.json`
- Create: `packages/database/src/repository.ts`
- Create: `packages/database/src/supabase-repository.ts`
- Create: `apps/collector/src/normalize.ts`
- Create: `apps/collector/tests/normalize.test.ts`
- Create: `apps/collector/tests/retry-idempotency.test.ts`

**Interfaces:**
- Produces: `normalizeSnapshot(repository, snapshot): Promise<NormalizationSummary>` and repository upsert methods keyed by canonical identities.

- [ ] **Step 1: Write failing normalization and replay tests**

Run identical fixtures twice and assert equal canonical counts. Inject a failure after war-member writes, rerun the collection, and assert the final rows and derived inputs equal a clean run.

```ts
expect(await repository.counts()).toEqual({
  seasons: 1,
  wars: 1,
  warMembers: 30,
  attacks: 27,
});
expect(await recommendationInputHash()).toBe(cleanRunHash);
```

- [ ] **Step 2: Verify the replay tests fail**

Run: `pnpm --filter @cwl/collector test -- retry-idempotency`

Expected: FAIL because normalization is not implemented.

- [ ] **Step 3: Implement canonical repository methods**

Expose explicit methods such as `upsertSeason`, `upsertWar`, `upsertWarMember`, and `upsertAttack`; each must target the matching database unique constraint. Do not expose generic insert methods for canonical facts.

- [ ] **Step 4: Implement transactional normalization units**

Normalize clan/profile snapshots separately from each war snapshot. Within a war unit, upsert war metadata, memberships, and attacks with their natural conflict targets. Mark the raw snapshot normalized only after the unit succeeds; a retry may safely repeat every upsert.

- [ ] **Step 5: Verify idempotency and commit**

Run: `supabase db reset && pnpm --filter @cwl/collector test`

Expected: clean, duplicate, partial-failure, and changed-war-state runs converge on correct canonical counts.

Commit: `git commit -m "feat: normalize CWL data idempotently"`

## Task 5: Derived Metrics and Recommendation Strategy

**Files:**
- Create: `packages/recommendations/package.json`
- Create: `packages/recommendations/src/strategy.ts`
- Create: `packages/recommendations/src/ordered-rules.ts`
- Create: `packages/recommendations/src/explanations.ts`
- Create: `packages/recommendations/src/ordered-rules.test.ts`
- Create: `packages/recommendations/src/scenarios.test.ts`
- Create: `supabase/migrations/202607110004_derived_views.sql`

**Interfaces:**
- Produces: `RecommendationStrategy.recommend(context): RecommendationResult` and `OrderedRulesStrategy`.

- [ ] **Step 1: Write failing strategy-contract and rule-order tests**

Cover unavailable/unknown exclusion, missed-attacker replacement, target-core preservation, eight-star eligibility, current-CWL reliability, opportunity count, Town Hall fit, deterministic player-tag fallback, contact-needed results, coverage gaps, limited confidence, and both priority modes.

```ts
export interface RecommendationStrategy {
  readonly version: string;
  recommend(context: RecommendationContext): RecommendationResult;
}
```

- [ ] **Step 2: Run tests and verify failure**

Run: `pnpm --filter @cwl/recommendations test`

Expected: FAIL because the strategy and ordered rules do not exist.

- [ ] **Step 3: Create deterministic derived views**

Create views for current-season assignments, completed/missed attacks, stars, opportunities, eight-star eligibility, and current-CWL reliability. Reliability is `completed_assigned_attacks / assigned_opportunities`; zero opportunities yields no reliability value and limited confidence.

- [ ] **Step 4: Implement ordered rules behind the strategy contract**

Use pure functions with stable sorting. Return structured reason codes, short explanations, confidence notes, contacts, and coverage gaps. Never hide an exclusion or invent a substitute.

- [ ] **Step 5: Verify all scenarios and commit**

Run: `pnpm --filter @cwl/recommendations test && pnpm --filter @cwl/recommendations typecheck`

Expected: all rule and scenario tests pass with deterministic output.

Commit: `git commit -m "feat: add explainable CWL recommendation strategy"`

## Task 6: Collector Scheduling, Health, and Docker Packaging

**Files:**
- Create: `apps/collector/src/schedule.ts`
- Create: `apps/collector/src/main.ts`
- Create: `apps/collector/tests/schedule.test.ts`
- Create: `apps/collector/tests/health.test.ts`
- Create: `docker/collector.Dockerfile`
- Create: `.dockerignore`

**Interfaces:**
- Produces: one long-running container entrypoint with a single scheduling authority and a Docker health check.

- [ ] **Step 1: Write failing schedule and health tests**

Use a fixed clock to assert hourly collection during an active league group and daily collection otherwise. Assert two missed expected windows produces stale health and `invalid_ip` remains a distinct actionable state.

- [ ] **Step 2: Verify tests fail**

Run: `pnpm --filter @cwl/collector test -- schedule health`

Expected: FAIL because schedule and health modules do not exist.

- [ ] **Step 3: Implement one scheduling loop**

On startup, collect immediately, then compute the next run from active-CWL state. Prevent overlapping runs with an in-process lease plus a database collection lease so restarts or duplicate containers cannot collect concurrently.

- [ ] **Step 4: Add the production container**

Use a multi-stage Node 22 Alpine build, run as a non-root user, copy only production dependencies and built collector files, set `TZ=America/New_York` by default, and implement a health check that reads the last successful collection status without exposing secrets.

- [ ] **Step 5: Build, test, and commit**

Run: `docker build -f docker/collector.Dockerfile -t cwl-collector:test .`

Expected: image builds successfully and `docker inspect` reports a health check and non-root user.

Commit: `git commit -m "feat: package scheduled CWL collector"`

## Task 7: Authenticated Dashboard and Progressive-Disclosure UX

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/app.tsx`
- Create: `apps/web/src/auth/session.tsx`
- Create: `apps/web/src/auth/protected-route.tsx`
- Create: `apps/web/src/dashboard/daily-dashboard.tsx`
- Create: `apps/web/src/dashboard/daily-summary.tsx`
- Create: `apps/web/src/dashboard/dashboard-model.ts`
- Create: `apps/web/src/season/season-summary.tsx`
- Create: `apps/web/src/recommendations/recommendation-card.tsx`
- Create: `apps/web/src/recommendations/recommendation-details.tsx`
- Create: `apps/web/src/availability/availability-editor.tsx`
- Create: `apps/web/src/admin/access-management.tsx`
- Create: `apps/web/src/styles.css`
- Create: `apps/web/src/**/*.test.tsx`
- Create: `apps/web/e2e/daily-workflow.spec.ts`

**Interfaces:**
- Consumes: Supabase authenticated data and `RecommendationResult`.
- Produces: GitHub Pages-compatible static frontend with leader/admin route guards.

- [x] **Step 1: Establish the frontend design direction before component code**

The approved behavior and hierarchy are recorded in `docs/superpowers/specs/2026-07-11-cwl-ops-assistant-design.md`. Treat `DESIGN-notion.md` as the source of truth for CSS styling. Record its tokens in `apps/web/src/styles.css`: warm `#f6f5f4` canvas, white surfaces, `#000000`/`#31302e` ink, `#e6e6e6` hairlines, Inter typography, 5–12px radii, barely-there elevation, and `#0075de` reserved for primary actions and links.

- [x] **Step 2: Write failing component and workflow tests**

Test signed-out routing, leader/admin access differences, the API-derived war countdown, attacks-used progress, confirmed-available count, eight-star count, conditional near-threshold copy, conditional season-outcome copy, grouped remove/add actions, `Why?` disclosure, approve/edit actions, availability editing, stale and `invalidIp` warnings, unknown contacts, coverage gaps, loading, and empty states.

```tsx
expect(screen.getByText("02:14:08")).toBeVisible();
expect(screen.getByText("11 / 15")).toBeVisible();
expect(screen.getByRole("heading", { name: "Remove these members" })).toBeVisible();
expect(screen.getByRole("heading", { name: "Add these members" })).toBeVisible();
expect(screen.queryByText("Applied rule order")).not.toBeInTheDocument();
await user.click(screen.getByRole("button", { name: "Why Sam?" }));
expect(screen.getByText("Applied rule order")).toBeVisible();
```

- [x] **Step 3: Verify tests fail**

Run: `pnpm --filter @cwl/web test`

Expected: FAIL because the frontend components do not exist.

- [x] **Step 4: Implement Discord auth, route guards, and invitation redemption**

Use Supabase OAuth with Discord. Preserve the intended route through login, redeem invitation exactly once, and route revoked/unauthorized users to a clear access-denied screen.

- [x] **Step 5: Implement the daily leader workflow**

Show freshness first, then the four functional daily KPIs and compact season summary. Present strategy substitutions as batched `Remove these members` followed by `Add these members`; keep one-for-one coverage calculations behind `Why?`. Put rule details, confidence, and alternates behind `Why?`. Provide accessible forms for availability and override notes.

- [x] **Step 6: Implement admin access management**

Allow admins to create expiring single-use invitation links, list active leaders, revoke access, and promote a leader to admin. Never show invitation tokens after their one-time creation response.

- [x] **Step 7: Verify responsiveness, accessibility, and commit**

Run: `pnpm --filter @cwl/web test && pnpm --filter @cwl/web build && pnpm exec playwright test`

Expected: component tests, production build, and desktop/mobile workflow tests pass.

Commit: `git commit -m "feat: add authenticated CWL leader dashboard"`

## Task 8: GitHub Pages and Supabase Production Configuration

**Files:**
- Create: `.github/workflows/deploy-pages.yml`
- Create: `docs/runbooks/supabase.md`
- Modify: `apps/web/vite.config.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces: reproducible frontend deployment and documented Supabase production bootstrap.

- [x] **Step 1: Configure Pages-safe routing and base URL**

Use hash routing unless a custom 404 fallback is deliberately added. Set Vite `base` from `VITE_BASE_PATH` so local and repository Pages paths both work.

- [x] **Step 2: Add the Pages workflow**

Pin Node 22 and pnpm, install with frozen lockfile, run typecheck/tests/build, upload only `apps/web/dist`, and deploy through GitHub's official Pages actions.

- [x] **Step 3: Document Supabase production setup**

Include project creation, migration deployment, Discord OAuth callback URLs, Nick's admin bootstrap, RLS verification, public frontend variables, service-role secret handling, 90-day cleanup scheduling, and rollback instructions.

- [x] **Step 4: Verify and commit**

Run: `pnpm typecheck && pnpm test && pnpm build`

Expected: workspace passes and the Pages artifact contains no service-role or Clash secret strings.

Commit: `git commit -m "ci: deploy dashboard to GitHub Pages"`

## Task 9: UnRaid Deployment and Operator Runbook

**Files:**
- Create: `docs/runbooks/unraid.md`
- Create: `deploy/unraid/collector.env.example`
- Create: `deploy/unraid/docker-compose.yml`
- Create: `scripts/verify-collector.sh`

**Interfaces:**
- Consumes: built collector image, Supabase production values, Clash token, and SSH connection details stored in `Personal-Vault` project/session documentation.
- Produces: a reproducible UnRaid deployment, manual fallback, and verified healthy first collection.

- [ ] **Step 1: Preflight without changing UnRaid**

Retrieve the host, SSH username, identity/config alias, and preferred app-data conventions from `Personal-Vault`. Ask Nick only for missing values. Run read-only checks for SSH reachability, Docker availability, architecture, timezone, free space, and existing container/name conflicts. Do not print private key material or secret values.

- [ ] **Step 2: Write the runbook and environment reference**

Document both SSH-assisted and UnRaid UI paths. Required variables are `CLASH_API_TOKEN`, `CLAN_TAG`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `TZ`; optional variables include log level and collector cadence overrides. Explain the public-WAN-IP allowlist and current-IP verification without committing the IP or token.

- [ ] **Step 3: Add reproducible compose configuration**

Define one collector service with `restart: unless-stopped`, read-only root filesystem where compatible, non-root user, secret environment file, persistent app-data mount only if required, outbound networking, and health check. Do not publish ports.

- [ ] **Step 4: Add safe verification script**

The script must verify container health, sanitized recent logs, Clash/Supabase connectivity status, latest raw snapshot time, latest canonical war/member counts, and collection health. It must fail if duplicate canonical identities exist.

- [ ] **Step 5: Perform an authorized deployment or manual handoff**

If Nick authorizes SSH writes, copy only deployment assets, create protected directories/files, start the container, and run verification. Otherwise, walk Nick through the exact UnRaid UI fields and commands from the runbook and wait for returned verification output.

- [ ] **Step 6: Test retry idempotency on UnRaid**

Record canonical counts, invoke two consecutive collection runs against the same latest API state, and assert the duplicate query remains empty and canonical counts do not inflate except for raw collection-run/snapshot evidence.

- [ ] **Step 7: Verify rollback and commit**

Demonstrate stopping the new container and restoring the prior image/config without deleting Supabase data. Confirm no inbound port is exposed.

Commit: `git commit -m "docs: add UnRaid collector deployment runbook"`

## Task 10: End-to-End Acceptance and Production Handoff

**Files:**
- Create: `tests/e2e/cwl-acceptance.spec.ts`
- Create: `docs/runbooks/operations.md`
- Modify: `README.md`

**Interfaces:**
- Produces: verified MVP and monthly operating instructions.

- [ ] **Step 1: Write the fixture-driven acceptance test**

Exercise collect → raw snapshot → canonical normalization → availability entry → recommendation → explanation → approval/override. Include an unavailable member, unknown contact, missed attacker, eight-star rotation, limited-confidence substitute, and coverage-gap case.

- [ ] **Step 2: Run the acceptance test and fix only integration defects**

Run: `pnpm exec playwright test tests/e2e/cwl-acceptance.spec.ts`

Expected: PASS with no console errors, failed requests, or accessibility violations.

- [ ] **Step 3: Run complete verification**

Run: `supabase db reset && supabase test db && pnpm typecheck && pnpm test && pnpm build && pnpm exec playwright test && docker build -f docker/collector.Dockerfile -t cwl-collector:acceptance .`

Expected: every command exits 0.

- [ ] **Step 4: Write monthly operations and recovery guidance**

Document season creation, defaults, availability entry, daily approval, Elder review, stale/partial data, `invalidIp`, token rotation, invitation/revocation, raw cleanup, Supabase backup/restore assumptions, collector update/rollback, and the regular-war fast-follow scope.

- [ ] **Step 5: Verify production smoke path and commit**

Confirm Discord login, role enforcement, latest collection freshness, one recommendation approval, audit visibility, and UnRaid health. Record only non-sensitive evidence in the handoff.

Commit: `git commit -m "test: verify CWL assistant MVP end to end"`

## Execution Checkpoints

- After Task 2: review the schema, natural keys, RLS, and invitation threat model before collector work.
- After Task 5: review recommendation scenarios and explanations before building UI around the contract.
- After Task 7: perform a dedicated UX review with both compact and expanded leader flows.
- Before Task 9 writes to UnRaid: show the exact proposed remote changes and obtain Nick's authorization.
- After Task 10: decide whether to launch, run a fixture-only rehearsal, or defer production until the next CWL window.
