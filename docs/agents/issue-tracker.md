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

## Wayfinding operations

The `/wayfinder` skill expresses its map on GitHub. Verified against `gh` 2.96.0; both APIs below are live on this repo.

- **The map** is an issue labelled `wayfinder:map`. Find it with `gh issue list --label "wayfinder:map" --state open`.
- **Tickets** are issues labelled `wayfinder:<type>` (`research`, `prototype`, `grilling`, `task`), attached to the map as GitHub sub-issues.
- **Attach a ticket to the map** — note this takes the issue's database `id`, not its number:

  ```sh
  id=$(gh api repos/nswanger/clash-of-clans/issues/<ticket>/ --jq .id)
  gh api -X POST repos/nswanger/clash-of-clans/issues/<map>/sub_issues -F sub_issue_id="$id"
  ```

- **Blocking** uses GitHub's native issue dependencies, so the frontier renders in the GitHub UI without opening the map. Also takes a database `id`:

  ```sh
  id=$(gh api repos/nswanger/clash-of-clans/issues/<blocker>/ --jq .id)
  gh api -X POST repos/nswanger/clash-of-clans/issues/<blocked>/dependencies/blocked_by -F issue_id="$id"
  ```

- **Read a ticket's blockers**: `gh api repos/nswanger/clash-of-clans/issues/<n>/dependencies/blocked_by`.
- **The frontier** is open sub-issues with no open blockers and no assignee. There is no single query for this; iterate the map's sub-issues and filter on open blockers.
- **Claim a ticket** before any work: `gh issue edit <n> --add-assignee @me`. An open, unassigned ticket is unclaimed.
- **Resolve a ticket**: post the answer as a comment, close the issue, then append a one-line gist plus link to the map's Decisions-so-far.
