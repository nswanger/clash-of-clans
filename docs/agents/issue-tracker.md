# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub Issues in `nswanger/clash-of-clans`. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`.
- **Read an issue**: `gh issue view <number> --comments`, including labels.
- **List issues**: `gh issue list --state open` with appropriate label and state filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`.
- **Apply or remove labels**: `gh issue edit <number> --add-label "..."` or `--remove-label "..."`.
- **Close an issue**: `gh issue close <number> --comment "..."`.

Infer the repository from `git remote -v`; the configured origin is `nswanger/clash-of-clans`.

## Pull requests as a triage surface

**PRs as a request surface: no.** External pull requests are not included in ordinary triage discovery. Explicitly named pull requests may still be reviewed when requested.

## When a skill says "publish to the issue tracker"

Create or update a GitHub Issue using `gh`.

## Existing local planning artifacts

The existing `.scratch/cwl-lineup-planning/` map and tickets are preserved as prior planning work. They are not the active issue tracker for new skill workflows and should not be deleted or migrated automatically.
