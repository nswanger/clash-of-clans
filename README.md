# Clash of Clans War Ops Assistant

Decision support for Clan War League (CWL) operations. The project collects Clash of Clans API snapshots, derives auditable participation and recommendation data, and presents it in a dashboard where clan leaders make the final call.

## Architecture

- **GitHub Pages:** hosts only the static web dashboard. The browser build supports availability entry, lineup review, overrides, and operational status checks; it must never contain collector credentials.
- **Supabase:** provides Discord authentication, Postgres storage, row-level authorization, and application RPCs for raw data, derived history, availability, recommendations, leader decisions, and audit events.
- **UnRaid:** runs the outbound-only collector container and schedules collection and raw-snapshot retention jobs. The collector fetches Clash API data, stores immutable raw snapshots, and normalizes CWL history in Supabase.

The MVP focuses on CWL collection, trustworthy history, availability, explainable lineup recommendations, and leader review. It never silently promotes, demotes, benches, or assigns a player; every consequential decision remains subject to human approval.

## Local setup

Keep secrets in ignored local environment files or your deployment secret store. The browser configuration is public and uses the exact Vite variable names from `.env.example`:

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=replace-with-public-anon-key
VITE_CLAN_TAG=#YOURCLAN
VITE_BASE_PATH=/
```

For project GitHub Pages, set `VITE_BASE_PATH` to `/repository-name/`; the deploy workflow otherwise derives that path from the repository name. Configure these values as GitHub Actions repository variables, not secrets, because Vite embeds them in the browser artifact.

The UnRaid collector uses the separate server-only names in `deploy/unraid/collector.env.example`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CLASH_API_TOKEN`, `CLAN_TAG`, and `TZ`. Never expose those server credentials through a `VITE_` variable. Never commit real API tokens, clan or player tags, private member notes, or production credentials. The UnRaid runbook contains the deployment-specific connection procedure; do not copy its sensitive values into source files or tickets.

Use the bundled Node 24 toolchain for local work. CI runs Node 22. Avoid Node 25 for this project because of the current jsdom compatibility issue.

## Verification

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm exec playwright test
```

Supabase and Docker acceptance checks require an appropriate local or isolated test environment. Follow the runbooks instead of copying production commands or credentials into a terminal session.

## Documentation

- [CWL operations runbook](docs/runbooks/operations.md)
- [Supabase runbook](docs/runbooks/supabase.md)
- [UnRaid runbook](docs/runbooks/unraid.md)
- [Implementation progress](docs/implementation-progress.md)
- [Implementation plan](docs/superpowers/plans/2026-07-11-cwl-ops-assistant.md)
