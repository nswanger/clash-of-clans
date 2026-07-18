# Clash of Clans War Ops Assistant

Decision support for Clan War League (CWL) operations. The project collects Clash of Clans API snapshots, derives auditable participation and recommendation data, and presents it in a dashboard where clan leaders make the final call.

## Architecture

- **Collector:** fetches clan, member, and CWL data and stores immutable raw snapshots.
- **Supabase:** holds raw data, derived history, availability, recommendations, leader decisions, and audit events.
- **Web dashboard:** supports availability entry, lineup review, overrides, and operational status checks.
- **Scheduled operations:** run collection and retention jobs, with UnRaid hosting the deployed services.

The MVP focuses on CWL collection, trustworthy history, availability, explainable lineup recommendations, and leader review. It never silently promotes, demotes, benches, or assigns a player; every consequential decision remains subject to human approval.

## Local setup

Keep secrets in ignored local environment files or your deployment secret store. Start from the repository's example environment files when present, and use placeholders such as:

```dotenv
CLASH_API_TOKEN=replace-with-local-token
SUPABASE_URL=https://replace-with-project-url
SUPABASE_ANON_KEY=replace-with-local-anon-key
SUPABASE_SERVICE_ROLE_KEY=replace-with-local-service-role-key
```

Never commit real API tokens, clan or player tags, private member notes, or production credentials. The UnRaid runbook contains the deployment-specific connection procedure; do not copy its sensitive values into source files or tickets.

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
