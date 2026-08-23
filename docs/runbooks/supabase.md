# Supabase Production Runbook

This runbook provisions the shared production database and Discord authentication for the static GitHub Pages dashboard. Replace every angle-bracket placeholder before using a command or URL.

## Production values

Choose the final Pages URL first. For a project Pages site, use:

```text
https://<github-owner>.github.io/<repository>/
```

The matching Vite base is `/<repository>/`. For a custom domain or user Pages site hosted at the domain root, the site URL is `https://<host>/` and the Vite base is `/`.

Record the Supabase project reference from **Project Settings > General**. The project API URL is:

```text
https://<project-ref>.supabase.co
```

## Create, link, and migrate the project

1. Create a production project in the [Supabase Dashboard](https://supabase.com/dashboard), select the intended organization and region, and store the generated database password in the password manager.
2. From this repository, authenticate and link the CLI to that project:

   ```sh
   supabase login
   supabase link --project-ref <project-ref>
   ```

3. Before changing production, validate the migrations and RLS tests against the local stack:

   ```sh
   supabase start
   supabase db reset
   supabase test db
   ```

4. Preview the exact remote migration set, review it, and only then apply it:

   ```sh
   supabase db push --dry-run
   supabase db push
   ```

Do not use the production Table Editor or SQL Editor for schema changes. Add a migration under `supabase/migrations`, test it locally, run the dry-run, and push it. The one-time admin role insert below is operational data bootstrap, not a schema change. See Supabase's [migration deployment guide](https://supabase.com/docs/guides/deployment/database-migrations) and [`db push` reference](https://supabase.com/docs/reference/cli/supabase-db-push).

## Deploy manual recommendation regeneration

The UnRaid collector regenerates recommendations after every finalized active-CWL collection. The `regenerate-recommendations` Edge Function provides the leader-only bypass used by the dashboard; it recalculates from already normalized CWL data and current availability without calling Clash or opening an inbound UnRaid port.

Deploy it after the database migrations:

```sh
supabase functions deploy regenerate-recommendations --project-ref <project-ref>
```

Supabase supplies `SUPABASE_URL` and `SUPABASE_ANON_KEY` to the function. It forwards the caller's Discord-authenticated JWT to the protected database functions and does not use a service-role key. The production GitHub Pages origin defaults to `https://nswanger.github.io`; set `CWL_WEB_ORIGIN` through the function environment before deployment when hosting from another origin.

Do not disable JWT verification. Verify an anonymous request returns `401`, an authenticated non-leader receives access denied, and a leader request either creates an idempotent proposal or reports that no normalized CWL lineup is available.

## Configure Discord authentication

1. In the Discord Developer Portal, create or select the application. Under **OAuth2 > Redirects**, add exactly the Supabase Auth callback URL, not the Pages URL:

   ```text
   https://<project-ref>.supabase.co/auth/v1/callback
   ```

2. In **Supabase > Authentication > Sign In / Providers > Discord**, enable Discord, enter the Discord Client ID and Client Secret, and save.
3. Allow new Auth users so an invited Discord account can create its `auth.users` row. Authorization still requires an `admin` or `leader` row in `public.user_roles`; RLS denies an authenticated user without either role.
4. In **Supabase > Authentication > URL Configuration**, set **Site URL** to the production site URL:

   ```text
   https://<github-owner>.github.io/<repository>/
   ```

5. In the same screen, add this application callback pattern to the **Redirect URLs** allow list:

   ```text
   https://<github-owner>.github.io/<repository>/?authCallback=1&returnTo=*
   ```

   The path and fixed `authCallback` query parameter match `signInWithDiscord` in `apps/web/src/auth/session.ts`; only the URL-encoded hash route in `returnTo` varies. For a custom or user Pages domain, use `https://<host>/?authCallback=1&returnTo=*` instead. Add `http://localhost:5173/?authCallback=1&returnTo=*` separately only if production Auth must support local frontend testing.

Supabase documents the provider callback in [Login with Discord](https://supabase.com/docs/guides/auth/social-login/auth-discord) and the allow-list pattern syntax in [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).

## Apply migrations before the frontend that needs them

**Pages deploys itself; the database does not.** `deploy-pages.yml` builds and publishes `apps/web` on every push to `main`, and nothing in it touches Supabase — migrations are applied by hand with `supabase db push`. A commit that merges a migration *and* a surface reading it therefore ships the surface immediately and the schema never, and the frontend fails at runtime against a column the database does not have.

This is the same rule the [UnRaid runbook](unraid.md) already states for the collector, and it binds for the same reason: the artifact and the schema deploy through different paths, so the schema has to go first.

Before merging a PR that reads new schema — a new column, view, or function — confirm the migration is already applied:

```sh
supabase migration list
```

Every local entry must have a matching remote entry. A row with an empty `remote` is unapplied, and any frontend code that reads it will break the moment it deploys. Push it first, following the validate-and-dry-run procedure above.

**Observed 2026-08-20.** `202608200001_cwl_bonus_administration.sql` merged with [#61](https://github.com/nswanger/clash-of-clans/issues/61) and was never pushed. The Clan Muster migration's wave 3 then shipped the review phase, whose loader selects `cwl_seasons.bonuses_administered_at`, and the CWL route's review phase failed to load in production. The migration file being present in the repository was mistaken for the column being present in the database; `supabase migration list` is what distinguishes them.

### CI enforces this rule

The check is no longer only a habit ([#65](https://github.com/nswanger/clash-of-clans/issues/65), [ADR 0003](../decisions/0003-ci-reads-the-migration-ledger.md)). A `migrations` job in `checks.yml` reads the remote ledger and fails when a local migration has no matching entry. It runs on every pull request and on the push to `main`, and because the Pages `deploy` job needs the checks, an unapplied migration blocks the publish.

A red check is not noise. The remedy is `supabase db push` — the same order this section already requires — and the pull request is where obeying it is cheapest.

Run the same check locally against the same credential:

```sh
SUPABASE_MIGRATION_AUDIT_URL='<migration-auditor-connection-string>' pnpm migrations:check
```

Exit `1` means a migration is unapplied. Exit `2` means the check could not reach the database and is deliberately distinct: "cannot tell" must never read as "nothing is unapplied".

### Provision the migration auditor credential

The check connects as `migration_auditor`, created by `202608220001_migration_audit_role.sql` with column-level `SELECT (version, name)` on `supabase_migrations.schema_migrations` and no grant on any application table. It cannot read `statements`, cannot write, and cannot see application data. This is why CI holds a database credential at all: `supabase migration list --linked` would need `SUPABASE_ACCESS_TOKEN`, which Supabase issues account-wide — a more privileged value than the collector secret this workflow is built to exclude.

1. Apply the migrations so the role exists, then generate a password and store it in the password manager.
2. In the production SQL Editor, run `supabase/production/enable_migration_auditor_login.sql` with that password substituted. It grants `LOGIN`, which no local database ever gets. It ends with one verification row: expect `can_log_in` and `can_read_version` true and every other column false. The check uses `has_*_privilege` rather than attempting a denied read on purpose — the SQL Editor submits the script as one batch, so a deliberate permission error would abort it and roll back the `ALTER ROLE`, leaving the password unset behind a message that looks like the test working.
3. Build the connection string from the Supabase **Connect** dialog, replacing the username and password with the auditor's. Use the **pooler** host: GitHub Actions runners are IPv4-only and the direct database host is IPv6.
4. Add it under **Settings > Secrets and variables > Actions > Secrets**:

   | Repository secret | Value |
   | --- | --- |
   | `SUPABASE_MIGRATION_AUDIT_URL` | The `migration_auditor` pooler connection string |

This is the only secret either workflow holds, and it is confined to the `migrations` job, which installs no dependencies and runs no project code. The rule against putting `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SECRET_KEY`, `CLASH_API_TOKEN`, or any `sb_secret_...` value into Actions is unchanged.

To rotate it, `ALTER ROLE migration_auditor WITH PASSWORD '<new>'`, update the secret, and re-run the workflow.

## Configure GitHub Pages

In **GitHub > Settings > Pages**, choose **GitHub Actions** as the source. Add these under **Settings > Secrets and variables > Actions > Variables**:

| Repository variable | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | The browser-safe Supabase publishable key, or the legacy `anon` key |
| `VITE_CLAN_TAG` | The production clan tag, including `#` |
| `VITE_BASE_PATH` | Optional; `/<repository>/` for project Pages or `/` for a custom/user Pages domain |

The workflow falls back to `/<repository>/` when `VITE_BASE_PATH` is absent. `VITE_SUPABASE_ANON_KEY` is a compatibility name: it may contain Supabase's current `sb_publishable_...` key. Browser configuration is public by design and protected data depends on Auth plus RLS, not key secrecy.

Never add `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SECRET_KEY`, `CLASH_API_TOKEN`, or any `sb_secret_...` value to GitHub Pages variables, secrets, build arguments, or artifacts. The Pages workflow injects only the four public `VITE_` values and scans `apps/web/dist` for collector-only secret names and the current Supabase secret-key prefix.

## Configure the collector credential

The collector runs server-side on UnRaid and needs `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CLASH_API_TOKEN`, `CLAN_TAG`, and `TZ`. Store them only in protected UnRaid container variables or a protected server-side environment file.

Use a current Supabase `sb_secret_...` key for the collector. The compatibility-named `SUPABASE_SERVICE_ROLE_KEY` variable accepts that current secret key and sends it only as an API key; it also retains support for the legacy JWT-based `service_role` key. Collector startup rejects publishable keys, personal access tokens, and unrecognized formats before making a request. Both supported server key types bypass normal RLS and must never be used in the browser. Supabase describes the current and legacy key types in [Understanding API keys](https://supabase.com/docs/guides/getting-started/api-keys).

## Bootstrap Nick as the first admin

Migration `202607110001_core_schema.sql` creates a `public.profiles` row after the first successful Auth signup, but the repository intentionally has no privileged bootstrap function.

1. After migrations and Discord configuration are complete, Nick signs in to the production dashboard once with Discord. The first attempt will show access denied because no application role exists yet; this is expected.
2. In **Supabase > Authentication > Users**, copy Nick's user UUID. Confirm the trigger created the matching profile with this read-only SQL:

   ```sql
   select id, display_name, created_at
   from public.profiles
   where id = '<nick-user-uuid>'::uuid;
   ```

3. In the production SQL Editor, run the one-time role insert using that same UUID in both fields:

   ```sql
   insert into public.user_roles (user_id, role, created_by)
   values (
     '<nick-user-uuid>'::uuid,
     'admin'::public.app_role,
     '<nick-user-uuid>'::uuid
   )
   on conflict (user_id, role) do nothing;
   ```

4. Verify the stored role, sign out, and sign back in:

   ```sql
   select p.id, p.display_name, ur.role, ur.created_at
   from public.profiles as p
   join public.user_roles as ur on ur.user_id = p.id
   where p.id = '<nick-user-uuid>'::uuid;
   ```

Future leaders should use the application's single-use invitation flow. Do not repeat this SQL to bypass invitations, and do not grant future invitees `admin` unless Nick deliberately promotes them.

## Verify RLS

Run the repository's pgTAP suite before every migration push:

```sh
supabase start
supabase db reset
supabase test db
```

The tests in `supabase/tests/rls_test.sql` and `supabase/tests/invitation_admin_test.sql` cover unauthenticated access, leader permissions, admin-only invitation/role management, and invitation redemption. The remaining pgTAP files cover retention, append-only decisions, and schema integrity.

After deployment, use these non-destructive production checks:

1. In the SQL Editor, confirm RLS remains enabled on every application table:

   ```sql
   select c.relname as table_name, c.relrowsecurity as rls_enabled
   from pg_class as c
   join pg_namespace as n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'r'
   order by c.relname;
   ```

2. Review **Database > Policies** and the Supabase Security Advisor. Do not dismiss unexpected findings.
3. In a signed-out private window, confirm the dashboard exposes no clan data. As Nick, confirm admin access. With a deliberately invited test leader, confirm leader data/actions work but access management does not.
4. Never use the collector secret key for browser spot checks; it bypasses RLS and cannot prove browser authorization works.

## Schedule 90-day raw cleanup

Migration `202607110003_retention.sql` creates `public.purge_expired_raw_snapshots()`, deletes only `public.raw_snapshots` older than 90 days, returns the deleted row count, and grants execution to `service_role`. Migration `202607180011_retention_cron_configuration.sql` enables `pg_cron` and creates an idempotent configuration function, but deliberately does not register a job in every local, branch, or test database.

After deploying the migrations, run `supabase/production/configure_retention_cron.sql` once against production through the SQL Editor. It registers exactly one active job with:

- Name: `purge-expired-raw-snapshots`
- Schedule: `17 3 * * *` (03:17 UTC daily)
- SQL snippet: `SELECT public.purge_expired_raw_snapshots();`

Verify the registered job without changing data:

```sql
select jobid, jobname, schedule, command, active
from cron.job
where jobname = 'purge-expired-raw-snapshots';
```

After its first scheduled run, inspect **Integrations > Cron > Jobs** or query `cron.job_run_details` for that job's status. Supabase documents dashboard and SQL scheduling in [Cron](https://supabase.com/docs/guides/cron) and its [quickstart](https://supabase.com/docs/guides/cron/quickstart).

## Rollback and recovery

### Frontend or workflow

Revert the faulty deployment commit with `git revert <commit-sha>` and push the revert to `main`; the workflow will build and deploy the previous configuration as a new Pages deployment. If only a repository variable is wrong, restore its last known good value and dispatch **Deploy dashboard to GitHub Pages** manually. Do not put collector secrets into the workflow while troubleshooting.

### Database migration

Do not run `supabase db reset` against production and do not edit an applied migration. Create a new forward corrective migration, validate it locally with `supabase db reset` and `supabase test db`, then run `supabase db push --dry-run` before `supabase db push`. Restore deleted or transformed production data from the applicable Supabase backup only after assessing the recovery scope.

### API keys

For a collector key, create a replacement secret key, update the protected UnRaid value, restart and verify the collector, and only then revoke the old key. For a browser publishable key change, update `VITE_SUPABASE_ANON_KEY` and redeploy Pages. If any secret reached a frontend artifact, remove the exposure, rotate the secret immediately, and verify the new artifact scan before revoking the old deployment.

### OAuth configuration

Restore the last known good Supabase Site URL, redirect allow-list entry, Discord provider credentials, and Discord callback URL. If the Discord client secret was exposed, rotate it in Discord first and update Supabase. Verify sign-in and the role checks with Nick before inviting more leaders.
