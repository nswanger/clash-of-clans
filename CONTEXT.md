# Clash of Clans product context

Glossary of the product's terms. Each entry defines; the *why* lives in `docs/decisions/` where a record exists.

## CWL operations glossary

- **CWL season**: The monthly Clan War League campaign that establishes the participating roster and war-day decisions.
- **Roll call**: Who said yes to the pre-season availability message, recorded against a *month* before that month's CWL season exists. Distinct from season availability, which it seeds once the season is collected: it is keyed by month rather than season, holds only the yeses, and is discarded when the next season seeds ([#96](https://github.com/nswanger/clash-of-clans/issues/96)).
- **Season availability**: A member's leader-recorded participation state for the entire CWL season: `unknown`, `available`, or `unavailable`. A missing row is `unknown`; availability is never copied between seasons ([0009](docs/decisions/0009-planned-and-observed-lineups-stay-distinct.md)).
- **Planned lineup**: The leader-owned lineup for one CWL war day. Each day is an independent snapshot after its initial inheritance from the prior day ([0009](docs/decisions/0009-planned-and-observed-lineups-stay-distinct.md)).
- **Observed lineup**: The lineup and results the Clash API reports for a war day. It is evidence and never replaces the planned lineup.
- **Daily lineup lock**: A per-war-day guard that blocks planned-lineup membership and ordering changes while leaving availability and observed evidence editable. Any leader or admin may set or clear it; actor and time are recorded.
- **Lineup revision**: The version number of one day's planned lineup, used to reject stale saves and prompt a reload ([0011](docs/decisions/0011-optimistic-concurrency-reload-not-merge.md)).
- **Applied-lineup baseline**: What the game is known to hold for one war day — a base member set plus the ordered membership changes a leader confirmed making in game. The in-game checklist is the saved plan minus this baseline. An observed war roster replaces the baseline wholesale.
- **Elder**: A verified current clan role (API wire token `admin`), used only as a final tie-breaker among otherwise comparable eligible CWL candidates ([0010](docs/decisions/0010-elder-is-a-tie-breaker-only.md)).
- **Regular-war history**: Observed activity and attack-performance evidence from completed non-CWL clan wars. Signup owns regular-war opportunity, so absence is not a performance penalty ([0001](docs/decisions/0001-cwl-evidence-and-bonus-priority.md)).
- **War summary**: A war-log record of war-level facts (timing, opponent, result, clan totals) that asserts nothing about individual participation.
- **Member war observation**: A war payload observed with member-level assignment and attack facts; the only evidence that can support individual participation or missed-attack metrics.
- **Regular-war finalization evidence**: Confidence that an observed regular war holds its final member-level results: `pending`, `complete_war_ended`, `complete_at_transition`, or `incomplete`. A transition to `notInWar` is complete when the last member observation reached the known end time.
- **History coverage**: The distinction between known war summaries and member-level observations; missing member detail is unknown, not evidence of non-participation.
- **Regular-war activity gauge**: A summary of observed regular-war appearances, assigned attacks, completed attacks, stars, and rates. It informs review and follow-up; it never determines regular-war lineups.
- **Activity window**: The recent period, in days, a surface reports activity over; the clan-wide war count is scoped to the same window. A war belongs to a window by its recorded end time; an ended war with no end time counts in the lifetime gauge and falls in no window.
- **CWL phase**: Which state of a season the CWL route presents: `lineup` while a day is in preparation or in war, `review` once every logged day has ended, and `resting` once bonuses are marked administered (or, for an unmarked season, some time after the final war). It is a leader-visible control, not a hidden conditional ([0002](docs/decisions/0002-app-surfaces-and-cwl-phase.md)).
- **Post-CWL review**: The season-scoped, member-ranked decisions taken once stars are final: bonus medals, role moves, follow-ups. Distinct from day-scoped lineup management and from the per-member year-round roster ([0002](docs/decisions/0002-app-surfaces-and-cwl-phase.md)).
- **Bonus administration**: Whether a season's bonus medals have been handed out in game — one leader-set timestamp per season. It records that the job is done, never who received one; it is the resting phase's marker.
- **CWL lineup rating**: A 0–100 reference signal from observed current-CWL attack completion. Not a rule and not a decision ([0001](docs/decisions/0001-cwl-evidence-and-bonus-priority.md)).
- **Regular-war activity score**: A 0–100 measure of attacks made over attacks assigned in completed regular wars the member appeared in.
- **Regular-war performance score**: A 0–100 measure from stars per completed regular-war attack, shown separately from activity.
- **Bonus priority**: The season-scoped bonus reference: all members visible, those at eight or more CWL stars ranked first by total stars, with wars participated and stars per war as context ([0001](docs/decisions/0001-cwl-evidence-and-bonus-priority.md)).
- **Lineup History**: Compact operational events for a day — initialization, saves (before/after as member names), re-inheritance, lock changes, observed refreshes. Individual drag movements are not retained.
