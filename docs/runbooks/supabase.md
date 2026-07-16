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

Migration `202607110003_retention.sql` creates `public.purge_expired_raw_snapshots()`, deletes only `public.raw_snapshots` older than 90 days, returns the deleted row count, and grants execution to `service_role`. It deliberately does not create a schedule.

Prerequisite: enable the Supabase Cron integration (`pg_cron`) for the production project. Then create a daily database job in **Integrations > Cron** with:

- Name: `purge-expired-raw-snapshots`
- Schedule: `15 3 * * *` (03:15 UTC daily)
- SQL snippet: `select public.purge_expired_raw_snapshots();`

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
