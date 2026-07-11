# Task 4 Report — Canonical Normalization and Retry Idempotency

## Status

DONE_WITH_CONCERNS: implementation and unit/static verification are complete. Live Supabase reset/pgTAP verification remains deferred because the Supabase CLI is unavailable.

## Implementation

- Added `@cwl/database` with explicit canonical repository methods for seasons, members, wars, war members, and attacks.
- Added a Supabase adapter using the schema's natural conflict targets: `(clan_tag, season_id)`, `(clan_tag, season_id, player_tag)`, `war_tag`, `(war_tag, player_tag)`, and `(war_tag, attacker_tag, attack_order)`.
- Added league-group normalization for season policy defaults, roster members, and war-day identities.
- Added league-war normalization for evolving war metadata, lineup membership, and attacks.
- Raw snapshots are marked normalized only after every write in their normalization unit succeeds.
- Retry behavior repeats natural-key upserts, allowing duplicate, partial-failure, and changed-state runs to converge.

## TDD Evidence

- RED: `node_modules/.bin/vitest run tests/retry-idempotency.test.ts` from `apps/collector` failed because `../src/normalize.js` did not exist (exit 1).
- GREEN focused: 2 test files and 4 tests passed for normalization and replay idempotency.
- The partial-failure test injects an error immediately after all war-member writes, verifies the raw snapshot is not marked normalized, retries, and compares canonical counts plus a SHA-256 recommendation-input hash with a clean run.

## Verification

- `pnpm --filter @cwl/collector test`: 5 files, 25 tests passed.
- `pnpm -r typecheck`: collector, database, and domain packages passed.
- `pnpm --filter @cwl/collector test -- retry-idempotency`: 5 files, 25 tests passed (Vitest's forwarded filter did not narrow collection, but included both retry tests).
- `git diff --check`: passed.
- `supabase --version`: command unavailable; therefore `supabase db reset` and live database verification were not run.

## Files Changed

- `apps/collector/src/normalize.ts`
- `apps/collector/tests/normalize.test.ts`
- `apps/collector/tests/retry-idempotency.test.ts`
- `apps/collector/tests/normalization-fixture.ts`
- `packages/database/package.json`
- `packages/database/tsconfig.json`
- `packages/database/src/repository.ts`
- `packages/database/src/supabase-repository.ts`
- `pnpm-lock.yaml`

## Self-review

- Correctness: canonical identities match database primary/unique constraints; changed war state overwrites the same war row; normalized timestamps occur last.
- Scope: no deployment configuration, credentials, or unrelated project files changed.
- Security: repository inputs contain canonical game facts only; no tokens, production tags, or private notes were added.
- Tests: covers clean normalization, exact canonical counts, duplicate replay, failure after membership writes, raw normalization ordering, derived-input equivalence, and changed war state.

## Concerns

- Supabase CLI/Docker are unavailable, so adapter/database behavior is typechecked and unit-modeled but not exercised against a live Postgres instance.
- `completeWarMemberWrites` is a normalization-unit boundary/no-op in the Supabase adapter and a failure seam in tests; database writes rely on replay-safe upserts rather than a single Postgres transaction across the complete war unit.

## Independent-review fixes

- Replaced the prior war-write sequence with one `apply_cwl_war_unit` Supabase RPC. PostgreSQL executes the function as one transaction containing war metadata, authoritative child replacement, membership inserts, and attack inserts.
- The RPC deletes the prior war's attacks and memberships inside the transaction before inserting the newest authoritative facts. Removed members/attacks disappear, corrected attacks overwrite prior values, and map-position changes cannot encounter stale unique keys.
- The RPC is `security invoker`; execute is revoked from `public`, `anon`, and `authenticated` and granted only to `service_role`.
- `normalizeSnapshot` awaits the atomic RPC before calling `markSnapshotNormalized`, so a rejected/rolled-back unit leaves the raw snapshot pending.
- Replaced the former no-op transaction seam with an in-memory transaction model that snapshots and restores war facts when failure is injected after member writes.

### Review-fix TDD evidence

- RED: strengthened retry tests failed with 30 partially visible memberships after injection and stale counts of 30 memberships/27 attacks after authoritative removals.
- GREEN: rollback now exposes 0 memberships/0 attacks and preserves the placeholder war state; retry converges to the clean-run hash.
- Added authoritative changed-state coverage: one removed member, one removed attack, and one corrected attack converge to 29 memberships/26 attacks with the corrected three-star value.
- Added an adapter-boundary assertion that one `apply_cwl_war_unit` RPC receives the complete war/membership/attack payload.
- Full collector verification after fixes: 5 files, 27 tests passed.
- Locked TypeScript binaries passed for collector, database, and domain projects; `git diff 0c77cf4 --check` passed.

### Updated concerns

- The earlier concern about non-transactional war writes is resolved by migration `202607110004_atomic_war_normalization.sql`.
- Live `supabase db reset`/pgTAP execution remains deferred because the Supabase CLI and Docker are unavailable; SQL was statically reviewed for transaction scope, conflict targets, reconciliation ordering, and execute privileges.
