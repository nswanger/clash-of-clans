# Clash of Clans War Ops Assistant

## Purpose

Pull Clash of Clans API data and turn it into decision support for clan leaders: CWL lineups and rotation, post-CWL bonus and role review, and a year-round roster. The app explains tradeoffs; a human makes every lineup, promotion, demotion, and benching decision.

## Principles

- Actionable clan decisions, not data collection. Every surface answers a question a leader actually asks.
- Simple, auditable scoring before clever automation. Recommendations are previews with visible reasons and uncertainty.
- Raw pulls stay separate from derived metrics so calculations can be inspected and rerun.
- Make uncertainty visible: missing, stale, rate-limited, or inferred data says so. Absence of evidence is never a penalty.
- Design around CWL timing: scheduled pulls, repeatable reports, clear daily deltas.
- Verify API behaviour against the official Supercell docs or live responses, never memory. The API exposes no chat, signups, or DMs.
- Ask Nick before irreversible choices about storage, hosting, auth, or member-facing workflows.

## Hard rules

- **Secrets and identity.** Never commit API tokens, player or clan tags, private member notes, or production credentials. Server credentials never appear under a `VITE_` name. This repo is public.
- **Collector host.** Connection details are in gitignored `deploy/unraid/target.env` (load with `set -a; . deploy/unraid/target.env; set +a`; create from the `.example`). Changes to the host need Nick's explicit authorization; procedure is `docs/runbooks/unraid.md`.
- **Schema before artifact.** A migration is applied (`supabase db push`) before any surface or collector image that reads it ships; CI enforces this for Pages, the UnRaid runbook for the collector.
- **Web app.** `apps/web` is built on the Clan Muster system in `design/`. No test query may name a class (use `getByRole`/`getByText`). Page CSS takes its surface's prefix, and a page rule overriding a `cm-` component needs an ancestor in the selector. `apps/web/src/test/e2e-client.ts` is a hand-maintained stub: filters hold only where the fixture models the column, and anything read against the clock is dated from the clock. A surface that needs a new component or token is a finding for `design/components.md`, not a licence to invent one. Appearance is checked by hand against `design/prototype/` at 375px and 1280px in both themes.

## Directory map

| Path | Role | Detail |
|---|---|---|
| `apps/web/` | Browser app (Vite/React; GitHub Pages) — three routes: CWL, Members, Admin | — |
| `apps/collector/` | Outbound-only Clash API collector (Docker on UnRaid) | `docs/runbooks/unraid.md` |
| `packages/domain/`, `packages/database/` | Domain contracts, database client | — |
| `supabase/` | Migrations, functions, pgTAP tests, production-only bootstrap SQL | `docs/runbooks/supabase.md` |
| `design/` | Clan Muster design system: tokens, component layer, prototypes | `design/README.md` |
| `deploy/unraid/`, `docker/` | Collector compose and Dockerfile | `docs/runbooks/unraid.md` |
| `scripts/` | `check-migrations.sh`, `verify-collector.sh`, `doc_lint.py` | — |
| `tests/e2e/` | Playwright workflows | — |
| `docs/` | Decisions, runbooks, product direction, API inventory, ephemera, archive | adapter below |

Where things live, the tracker, and validation: `.github/instructions/ai-workflow.instructions.md`. Terms: `CONTEXT.md`. Decisions: `docs/decisions/`.
