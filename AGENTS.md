# Clash of Clans War Ops Assistant

## Project Context
- This project exists to pull data from the Clash of Clans API and turn it into practical decision support for clan operations.
- The first priority is Clan War League (CWL), especially the first week of each month when lineup choices, participation tracking, and post-war promotion decisions are time-sensitive.
- The current manual pain point is gathering enough trustworthy information to answer questions like:
  - Who should be included in CWL lineups?
  - How should rosters shift between war days?
  - Who should be promoted, demoted, benched, or followed up with after the war?
  - What member behavior or performance patterns are easy to miss manually?
- The project may eventually include API services, scheduled data pulls, dashboards, and lightweight HTML pages for reviewing recommendations.

## Current API Assumptions
- Treat the Clash of Clans API as the source of truth for available game data, but verify endpoint availability against the official Supercell developer documentation before building around it.
- Do not assume the API exposes war signups, clan chat, direct messages, or in-game response data unless the official API confirms it.
- If signups or chat responses are unavailable through the official API, design around alternate inputs such as manual CSV uploads, forms, Discord exports, Google Sheets, or a small custom signup page.
- Keep API token handling secure. Never commit real API tokens, player tags, clan tags, or private member notes unless the user explicitly confirms the data is safe to store.

## Guiding Principles
- Build for actionable clan decisions, not just data collection.
- Prefer simple, auditable scoring and summaries before adding complex automation or AI-generated recommendations.
- Preserve human review for lineup, promotion, demotion, and benching decisions. The tool should explain tradeoffs, not silently decide for the clan.
- Design around CWL timing: scheduled pulls, repeatable reports, and clear daily deltas matter more than one-off analysis.
- Keep raw pulls separate from derived metrics so calculations can be inspected, corrected, and rerun.
- Favor small, composable pieces: API client, storage layer, metrics, recommendation logic, and UI should have clear boundaries.
- Make uncertainty visible. If data is missing, stale, rate-limited, or inferred, the UI/reporting should say so.

## Engineering Preferences
- Start with the smallest useful slice: authenticate, fetch clan/member/war data, persist snapshots, and produce a readable report.
- Use environment variables or local ignored config for secrets.
- Add tests around scoring and recommendation logic once those rules exist.
- Prefer boring, maintainable tools over clever frameworks until the project shape is clearer.
- Document decisions that affect clan policy, scoring weights, or promotion logic.

## Collaboration Notes For Future Agents
- Before implementing new features, inspect the current repo structure and follow established patterns.
- When API behavior matters, verify it against official Supercell documentation or live API responses instead of relying on memory.
- Ask Nick before making irreversible choices about data storage, hosting, authentication, or member-facing workflows.
- Keep responses concise and practical. Nick prefers direct, useful output over theoretical discussion.

## Agent skills

### Issue tracker

GitHub Issues in `nswanger/clash-of-clans`, managed with `gh`. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the default labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`. See `docs/agents/triage-labels.md`.

### Web app conventions

`apps/web` is built on the Clan Muster design system in `design/`. Four rules bind on every change to it, and three of them fail silently:

- **No query in any test suite may name a class.** All queries are `getByRole` or `getByText`, which is what lets a surface be restyled or rebuilt without touching the tests guarding every other surface.
- **Page CSS takes its surface's prefix, and a page rule overriding a `cm-` component needs an ancestor in the selector** — page stylesheets load *before* the component layer and lose every tie.
- **`apps/web/src/test/e2e-client.ts` is a hand-maintained stub, not a database.** Filters are honoured only where the fixture models the column, and anything read against the clock must be dated from the clock rather than written out.
- **A surface that needs a new component or a new token is a finding to record in `design/components.md`, not a licence to invent one.**

Full statements, with the failures that produced them, are in `design/README.md` and `design/components.md`. Appearance is verified by hand against the prototypes in `design/prototype/` at 375px and 1280px in both themes; there is no visual-regression tooling.

### Domain docs

Single-context documentation uses root `CONTEXT.md` and `docs/decisions/`. See `docs/agents/domain.md`.

### Collector deployment

The collector runs on Nick's UnRaid host. Connection details live in `deploy/unraid/target.env`, which is gitignored because this repository is public — load it with `set -a; . deploy/unraid/target.env; set +a` rather than asking where the host is. Create it from `deploy/unraid/target.env.example` if it is missing. Deployment and upgrade procedure is `docs/runbooks/unraid.md`; changes to the host still require Nick's explicit authorization.
