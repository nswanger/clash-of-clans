# Clash of Clans product context

## CWL operations glossary

- **CWL season**: The monthly Clan War League campaign that establishes the participating roster and war-day decisions.
- **Season availability**: A member's leader-recorded participation state for the entire CWL season: `unknown`, `available`, or `unavailable`.
- **Planned lineup**: The leader-owned lineup intended for one specific CWL war day. Each day is an independent snapshot after its initial inheritance from the prior day.
- **Observed lineup**: The lineup and results reported by the Clash API after the game assignment or war; it is factual evidence and does not replace the planned lineup.
- **Daily lineup lock**: A per-war-day guard that prevents planned lineup membership and ordering changes while leaving availability and observed evidence available.
- **Lineup revision**: The current version of one daily planned lineup used to detect concurrent edits and prompt a leader to reload stale work.
- **Elder**: A verified current clan role used only as a final tie-breaker among otherwise comparable eligible CWL candidates; it does not override availability or performance evidence.
- **Regular-war history**: Observed participation and attack evidence from completed non-CWL clan wars; it is supporting evidence and is limited to wars the collector actually observed.
- **War summary**: A historical war-log record that establishes war-level facts such as timing, opponent, result, and clan totals without asserting individual participation.
- **Member war observation**: A war payload observed with member-level assignment and attack facts; only this evidence can support individual participation or missed-attack metrics.
- **History coverage**: The explicit distinction between known war summaries and member-level observations; missing member detail is unknown, not evidence of non-participation.
- **Overall player rating**: A 0–100 lineup evidence summary combining current-CWL attack completion with regular-war participation and attack completion when those facts exist. It is a reference signal, not an automatic decision.
- **Bonus priority**: The season-scoped bonus reference keeps all members visible, ranks members at eight or more CWL stars first by total stars, and shows wars participated plus stars per war as supporting context. The separate rotation recommendation can still use eight stars as a reason to rotate someone out.

Availability rows are optional persistence: a missing row is the effective `unknown` state. Availability mutations are separate from planned-lineup mutations. Recommendations remain previews and do not require a separate leader-decision record in the lineup workspace. Lineup History retains compact operational events for initialization, saves with before-and-after lineup tags rendered as current member names, re-inheritance, lock changes, and observed API refresh summaries; it does not retain individual drag movements.
