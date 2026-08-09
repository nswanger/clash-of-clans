# Clash of Clans API Endpoint Inventory

Last checked: 2026-07-10

## Sources Checked
- Official developer portal: https://developer.clashofclans.com/
- Official Swagger UI shell: https://developer.clashofclans.com/api-docs/index.html
- Official API host probes: https://api.clashofclans.com/v1
- Authenticated Swagger UI in the Codex in-app browser

The public developer site loads a Swagger UI. The endpoint groups below were confirmed from the authenticated Swagger UI. API calls still require a valid developer token whose allowed IP list includes the machine making requests.

## Confirmed High-Value Endpoints

These are the first endpoints to validate and build around because they map directly to CWL lineup, war performance, and promotion workflows.

### Clan And Roster
- `GET /v1/clans`
  - Search clans.
- `GET /v1/clans/{clanTag}`
  - Clan profile: level, war league, labels, location, points, war stats, etc.
- `GET /v1/clans/{clanTag}/members`
  - Current member roster, roles, trophies, donations, exp level, town hall level where available.
- `GET /v1/clans/{clanTag}/capitalraidseasons`
  - Clan Capital raid season history.

### War And CWL
- `GET /v1/clans/{clanTag}/currentwar`
  - Current regular war state, participants, map positions, attacks, stars, destruction, and timing.
- `GET /v1/clans/{clanTag}/warlog`
  - Historical regular war results when the clan war log is public.
- `GET /v1/clans/{clanTag}/currentwar/leaguegroup`
  - Current CWL group metadata and war tags for the active league group.
- `GET /v1/clanwarleagues/wars/{warTag}`
  - Individual CWL war details, including attacks and results.

The collector now samples `currentwar` during its normal collection cadence and stores member-level regular-war evidence when the war is observable. A 2026-08-09 authorized probe of `warlog` returned war-level summaries without member records, so it is suitable for calendar/outcome context but not player activity backfill; missed collection windows remain visible as limited history rather than being backfilled or guessed.

### Player
- `GET /v1/players/{playerTag}`
  - Player profile: town hall, heroes, troops, spells, equipment/pets if exposed, achievements, clan role, donations, league, trophies, and labels.
- `GET /v1/players/{playerTag}/battlelog`
  - Player battle log.
- `GET /v1/players/{playerTag}/leaguehistory`
  - Player league history.
- `POST /v1/players/{playerTag}/verifytoken`
  - Verify a player API token from the player's in-game settings.

## Supporting Metadata Endpoints

These can enrich UI filters, comparisons, and normalization, but are probably secondary for the first useful version.

### Locations And Rankings
- `GET /v1/locations`
- `GET /v1/locations/{locationId}`
- `GET /v1/locations/{locationId}/rankings/clans`
- `GET /v1/locations/{locationId}/rankings/players`
- `GET /v1/locations/{locationId}/rankings/clans-builder-base`
- `GET /v1/locations/{locationId}/rankings/players-builder-base`
- `GET /v1/locations/{locationId}/rankings/capitals`

### Leagues
- `GET /v1/leagues`
- `GET /v1/leagues/{leagueId}`
- `GET /v1/leagues/{leagueId}/seasons`
- `GET /v1/leagues/{leagueId}/seasons/{seasonId}`
- `GET /v1/leaguetiers`
- `GET /v1/leaguetiers/{leagueTierId}`
- `GET /v1/builderbaseleagues`
- `GET /v1/builderbaseleagues/{leagueId}`
- `GET /v1/capitalleagues`
- `GET /v1/capitalleagues/{leagueId}`
- `GET /v1/warleagues`
- `GET /v1/warleagues/{leagueId}`
- `GET /v1/leaguegroup/{leagueGroupTag}/{leagueSeasonId}`

### Esports
- The authenticated Swagger UI includes an `esports` group, but no expanded operations were visible during this inspection.

### Labels
- `GET /v1/labels/clans`
- `GET /v1/labels/players`

### Gold Pass
- `GET /v1/goldpass/seasons/current`

## Signup And Chat Data

Do not assume official API access to:
- Clan chat messages
- Direct messages
- War signup responses
- CWL opt-in/opt-out responses
- Reactions, polls, or informal member availability notes

The authenticated Swagger UI did not show chat or signup endpoints. Until confirmed otherwise, plan to collect signup intent through another source such as a small web form, Discord workflow, Google Sheet, or manual CSV.

## First Data Model Implications

The first useful build should store snapshots of:
- Clan roster by pull time.
- Player profiles by pull time.
- Current CWL league group and war tags.
- Individual CWL war details by war tag.
- Derived attack results, missed attacks, stars, destruction, opponent strength, and lineup participation.

Keep raw API responses separate from derived metrics so scoring rules can be audited and rerun.
