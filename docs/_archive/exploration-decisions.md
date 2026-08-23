> Archived 2026-08-23 — exploration notes from 2026-07; durable choices are decision records 0005–0008, the rest is code or was superseded. History only.

# Exploration Decisions

Last updated: 2026-07-10

## Product Goal

- Reduce the monthly scramble for casual-clan CWL lineup management.
- Prioritize daily lineup and rotation decisions.
- Add a lightweight post-CWL promotion review when the captured data supports it.
- Keep recommendations explainable and leader-approved rather than fully automatic.

## Intended Users

- The primary users are Nick and the other clan leader who manages CWL lineups.
- Clan-wide adoption is not required for the first version.
- Leaders will translate in-game chat reactions into availability statuses in the tool.

## Shared Dashboard

- Build a clean shared webpage rather than make a spreadsheet the main interface.
- A public GitHub repository and GitHub Pages are acceptable for the frontend.
- A purchased domain is not required; the hosting provider's generated address is sufficient.
- Never expose the Clash API key or backend service credentials in browser code or the public repository.
- Use authenticated shared storage, currently expected to be Supabase, for availability, lineup decisions, and collected CWL data.

## Authentication And Authorization

- Use Discord OAuth through Supabase as the initial authentication provider.
- Bootstrap Nick as the first administrator.
- Let an administrator generate a single-use, expiring invitation link that can be sent through a Discord direct message.
- Consuming an invitation grants the authenticated Discord account leader access.
- Display a chosen leader alias rather than requiring leaders to reveal an email address or real name to each other.
- Model access with users, roles, and invitations rather than hard-coding exactly two accounts.
- Support independent access revocation and retain an audit trail of leader changes.
- Keep authorization separate from the Discord provider so additional leaders, roles, or Supabase-supported login providers can be added later without changing CWL data or recommendation logic.

## Data Collection

- Run the Clash API collector continuously on Nick's UnRaid server in a Docker container.
- The collector makes outbound requests to the Clash API and shared storage; UnRaid does not need to accept inbound public traffic.
- Poll frequently during CWL so league-group and individual war tags are captured before they become unavailable.
- The Clash developer key must allow the home's public WAN IP, not the UnRaid LAN or Tailscale address.
- The public WAN IP observed during exploration is intentionally omitted from this repository. It matched the IP previously reported by the Clash API, but residential GFiber may still change it later.
- Detect `403 invalidIp` responses and surface a clear collection-health warning.

## Availability

- Leaders maintain `Available`, `Unavailable`, and `Unknown` status based on clan-chat responses.
- Do not require every clan member to join Discord or another external service.
- A member-facing signup page can be reconsidered later, but it is not required for the initial version.

## Lineup Recommendations

- Never recommend a member marked unavailable.
- Prioritize replacing members who missed an assigned attack.
- Prefer available substitutes who have not yet secured full CWL rewards.
- When no available substitute exists, show a coverage gap rather than fabricate a swap.
- Unknown members may be shown as people for a leader to contact, with war preference and prior reliability used only as supporting context.
- Leaders can override recommendations and retain final control over in-game lineups.

## War Size Policies

- For 30-player CWL, emphasize attack reliability and replacing missed attackers.
- For 15-player CWL, balance attack reliability with rotating members toward the eight-star full-reward threshold.
- Use `10 core + 5 rotation` as the initial default for 15-player CWL.
- Use `20 core + 10 rotation` as the initial default for 30-player CWL.
- Treat core and rotation counts as configurable season settings rather than permanent classifications of members.
- Use the same recommendation engine for both war sizes, driven by season settings for war size, target core size, rotation positions, priority mode, and whether eight-star rotation is enabled.
- Interpret core membership as recommended stability for the current season, not as a permanent member label.
- Reaching eight stars makes a member eligible to rotate out, but should not require removing every reliable attacker simultaneously.
- Preserve the target core when recommending eight-star rotations unless a leader overrides the recommendation.
- Show assigned opportunities alongside completed and missed attacks because total attack count is partly controlled by leader rotation decisions.
- The exact balance between standings and reward distribution remains a policy decision for the detailed design.

## Promotion Review

- Six or more completed CWL attacks qualifies a member for the existing Elder rule.
- A member with fewer than six opportunities and no missed assigned attacks should not be automatically demoted.
- Being rotated out by leaders does not count against a member.
- Missing an assigned attack is a review or demotion signal.
- Promotion and demotion output remains advisory for leader review.

## Verified Clan Context

- Player: `<player name omitted>` (`<player tag omitted>`)
- Clan: `<clan name omitted>` (`<clan tag omitted>`)
- The configured clan tag matches the clan discovered from the player profile.
- The clan has a public war log and the API exposes its roster and current-war details.
- The API does not expose clan-chat reactions or CWL signup responses.

## Open Questions

- How frequently does the GFiber public WAN IP change in practice?
- How should ties between equally eligible substitutes be ranked?
- How long should raw API snapshots and derived history be retained?
