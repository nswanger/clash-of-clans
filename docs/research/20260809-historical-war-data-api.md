# Historical War Data API Findings

Date: 2026-08-09

## Executive finding

Supercell exposes three relevant read endpoints, but they support different
historical strategies:

- `GET /v1/clans/{clanTag}/warlog` is the historical regular-war entry point.
- `GET /v1/clans/{clanTag}/currentwar` is the current regular-war snapshot and
  the best source for member-level attack observations while the payload is
  available.
- `GET /v1/clanwarleagues/wars/{warTag}` retrieves an individual CWL war by
  war tag; it is the historical-detail path for CWL wars when the tag has been
  retained.

The repository currently implements the second and third endpoints, but not
`warlog`. Therefore regular-war member history currently begins when the
collector first observes a war; it is not seeded from the API's historical
war-log endpoint.

## Endpoint contract and implications

| Endpoint | Officially documented role | Data-seeding implication |
| --- | --- | --- |
| `GET /v1/clans/{clanTag}/warlog` | Retrieve the clan's regular-war log. The clan tag is a path parameter; the war log must be available to the API caller. | Use this first for historical regular-war discovery. Persist the returned war identity, dates/state, clan/opponent outcome summaries, and any member/attack fields actually present in an authorized response. Do not infer member participation from a war-level summary. |
| `GET /v1/clans/{clanTag}/currentwar` | Retrieve the clan's current regular war. The response describes the war state/timing, both sides, and current member/attack observations. | Continue polling this endpoint during preparation, war, and shortly after completion. It is the authoritative source for observed regular-war participation, assigned attacks, attack results, and names/tags in the collector's current model. |
| `GET /v1/clanwarleagues/wars/{warTag}` | Retrieve one CWL war by its war tag. | Persist every non-`#0` tag from the current CWL league group and use this endpoint to collect each round's detailed members and attacks. A tag-based lookup is not a general season-history search, so previously missed tags cannot be reconstructed from this endpoint alone. |

Sources: [official API portal](https://developer.clashofclans.com/), [official
Swagger UI](https://developer.clashofclans.com/api-docs/index.html), and the
corresponding [warlog](https://api.clashofclans.com/v1/clans/%23YOUR_CLAN_TAG/warlog),
[currentwar](https://api.clashofclans.com/v1/clans/%23YOUR_CLAN_TAG/currentwar),
and [CWL war](https://api.clashofclans.com/v1/clanwarleagues/wars/%23WAR_TAG)
resources.

## Important contract uncertainty

The public Swagger URL is only a static UI shell. Its JavaScript loads the
actual OpenAPI document from a `game-api-url` cookie established after an
authenticated developer-portal session. Without that session, the public
page does not expose the endpoint response schemas for independent inspection.
Accordingly, the following point should be treated as an implementation
question, not a settled API fact:

> Does the authorized `warlog` response include member-level participation and
> attack records, or only war-level summaries?

Before building a backfill, make one authorized request and preserve a
redacted fixture. The fixture should answer whether `warlog` includes member
tags/names, assigned attacks, attacks made, stars, destruction, map position,
war dates, opponent identity, and pagination markers. If it contains only
war-level summaries, it can seed the regular-war calendar and outcomes but
cannot fairly seed player ratings; member-level ratings must start from
`currentwar` observations.

## Repository context

The existing inventory lists all three endpoints, but the collector currently
has methods for `currentwar` and individual CWL wars only. Collection normalizes
regular-war members from the `clan.members` array and counts their `attacks`,
while CWL collection obtains war tags from the league group and fetches each
individual war. There is no `warlog` snapshot, pagination loop, or historical
backfill job today.

Sources: [repository endpoint inventory](../api-endpoint-inventory.md),
[`ClashClient`](../../apps/collector/src/clash-client.ts), and [collection
flow](../../apps/collector/src/collect.ts).

## Recommended next decision

1. Run an authorized, redacted `warlog` probe and record the exact response
   shape and visibility behavior.
2. If member details are present, add an idempotent historical import keyed by
   `(clan_tag, war_identity, player_tag)` and retain raw snapshots separately
   from derived ratings.
3. If they are absent, use `warlog` only to seed war-level context and keep
   `currentwar` polling as the source of member performance evidence.
4. Treat CWL history separately: retain season, war day, war tag, lineup
   membership, attack results, stars, and the collection-confidence timestamp.
   Do not mix regular-war participation into CWL bonus qualification until the
   product policy explicitly chooses that behavior.
