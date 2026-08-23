---
status: accepted
date: 2026-08-22
deciders: [Nick]
type: structural
supersedes:
---
# CI reads the migration ledger with a narrow database role

**Pages deploys itself and the database does not.** `deploy-pages.yml` builds and publishes `apps/web` on every push to `main`; migrations are applied by hand with `supabase db push`. The two paths were connected by nothing, so a commit merging a migration *and* a surface that reads it shipped the surface immediately and the schema never. Observed 2026-08-20: `202608200001_cwl_bonus_administration.sql` merged with [#61](https://github.com/nswanger/clash-of-clans/issues/61) and was never pushed, and the CWL review phase then failed in production against a column the database did not have. The migration file being present in the repository was mistaken for the column being present in the database.

**CI now fails when a local migration has no entry in the remote ledger.** It runs on pull requests and on the push to `main`, and because the Pages `deploy` job needs the checks, an unapplied migration blocks the publish rather than shipping a surface against absent schema. This settles [#65](https://github.com/nswanger/clash-of-clans/issues/65), which deliberately refused to assume the answer.

## The credential is the whole decision

The obvious implementation, `supabase migration list --linked`, authenticates with `SUPABASE_ACCESS_TOKEN`. Supabase scopes OAuth apps, not personal access tokens, so that token is **account-wide** — strictly more privileged than the collector's service-role key, which is the exact class of value the Pages artifact scan exists to keep out. Putting it in Actions would have traded a runtime bug for a standing credential risk, and #65 was right to call that a decision rather than a drive-by.

**The token is not required, because the migration ledger is an ordinary table.** `supabase_migrations.schema_migrations` has three columns, and the check needs two of them. `202608220001_migration_audit_role.sql` creates `migration_auditor`: `USAGE` on that one schema and column-level `SELECT (version, name)` on that one table — no grant on any application table, and RLS besides. `statements` is excluded deliberately — it holds the full DDL text of every applied migration, and knowing *which* versions exist never requires knowing what they did. Worst-case disclosure of this credential is the list of migration filenames already public in this repository.

Two supporting choices follow from the same reasoning:

**The role is `NOLOGIN` in the migration and gains `LOGIN` only in production, by hand** (`supabase/production/enable_migration_auditor_login.sql`). A password in `supabase/migrations` would be a password in every clone and every local database. This is a credential bootstrap, not a schema change — the same reason the first admin role insert lives outside the migrations.

**The check is its own CI job, not a step in `checks`.** The job installs no project dependencies and runs no project code. The Pages build's guarantee is that it handles nothing but the four public `VITE_` values; a database credential sitting in the job that runs `pnpm install` would end that guarantee even though the credential is narrow. Isolation is what makes the narrow credential safe, not the narrowness alone.

It reads the ledger with `psql` rather than the Supabase CLI. `supabase migration list --db-url` would work, but it selects the whole row, which would force the role's grant wider than the question needs.

## Failing a pull request is the feature, not the noise

#65 asked whether the check should gate the deploy (honest but leaves `main` red) or a pull request (earlier, but the migration is usually pushed around merge time, so the check "would have to tolerate unapplied but about to be").

**There is no tolerance, and there are no two modes.** The rule the runbooks already state is that the schema deploys before the artifact that reads it, so a red pull request is not a false positive — it is that rule, arriving at the moment it is cheapest to obey. The remedy is `supabase db push`, which is the same remedy at either gate and the correct next action in either case. A check that tolerated "about to be" would be tolerating precisely the state that broke production on 2026-08-20.

Remote entries with no local file are reported and **do not fail**. That means production is ahead of the branch, which is normal on a branch cut before the last push and is never the failure this exists for.

An unreachable database exits `2`, distinct from `1`. "I cannot tell" must never be readable as "nothing is unapplied" — that confusion is the same shape as the one that caused the original defect.

## What this does not replace

The runbook rule and the pre-season checklist item stay. CI covers the web app's deploy path; the collector deploys from UnRaid by hand and this check never runs there, so [the UnRaid runbook](../runbooks/unraid.md)'s requirement to apply migrations before starting a new image remains the only guard on that path.
