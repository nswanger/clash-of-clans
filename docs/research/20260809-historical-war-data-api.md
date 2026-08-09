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
`warlog`. An authorized probe on 2026-08-09 returned a paginated list of
war-level summaries only: it included result, end time, team size, attack
settings, clan/opponent totals, and no member roster or attack records. A
redacted response shape is preserved in
[`docs/research/fixtures/20260809-warlog-redacted.json`](fixtures/20260809-warlog-redacted.json).
Therefore regular-war member history currently begins when the collector
first observes a war; it is not seeded from the API's historical war-log
endpoint.

## Endpoint contract and implications

| Endpoint | Officially documented role | Data-seeding implication |
| --- | --- | --- |
| `GET /v1/clans/{clanTag}/warlog` | Retrieve the clan's regular-war log. The clan tag is a path parameter; the war log must be available to the API caller. | Use this for war-level calendar/outcome context only. The authorized response probed here had no member/attack fields, so do not infer individual participation from it. |
| `GET /v1/clans/{clanTag}/currentwar` | Retrieve the clan's current regular war. The response describes the war state/timing, both sides, and current member/attack observations. | Continue polling this endpoint during preparation, war, and shortly after completion. It is the authoritative source for observed regular-war participation, assigned attacks, attack results, and names/tags in the collector's current model. |
| `GET /v1/clanwarleagues/wars/{warTag}` | Retrieve one CWL war by its war tag. | Persist every non-`#0` tag from the current CWL league group and use this endpoint to collect each round's detailed members and attacks. A tag-based lookup is not a general season-history search, so previously missed tags cannot be reconstructed from this endpoint alone. |

Sources: [official API portal](https://developer.clashofclans.com/), [official
Swagger UI](https://developer.clashofclans.com/api-docs/index.html), and the
corresponding [warlog](https://api.clashofclans.com/v1/clans/%23YOUR_CLAN_TAG/warlog),
[currentwar](https://api.clashofclans.com/v1/clans/%23YOUR_CLAN_TAG/currentwar),
and [CWL war](https://api.clashofclans.com/v1/clanwarleagues/wars/%23WAR_TAG)
resources.

## Probe result

The public Swagger URL is only a static UI shell. Its JavaScript loads the
actual OpenAPI document from a `game-api-url` cookie established after an
authenticated developer-portal session, so the live authorized request was
used to settle the response-shape question. The response had `items` and
`paging.cursors`; item records contained war-level clan/opponent summaries
but no member tags, names, assigned attacks, attacks made, stars by player,
or map positions. The probe therefore supports war-calendar seeding but not
historical player ratings. Member-level ratings must start from
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

1. Use `warlog` only to seed war-level context if the product needs a regular-
   war calendar or outcome history. Do not use it to backfill member activity.
2. Keep `currentwar` polling as the source of member performance evidence and
   preserve the distinction between observed member activity and unknown
   history.
3. Treat CWL history separately: retain season, war day, war tag, lineup
   membership, attack results, stars, and the collection-confidence timestamp.
4. Keep regular-war activity and CWL lineup rating as separate signals: activity
   describes observed regular-war attack usage/performance, while the CWL
   rating describes current-CWL attack completion. Neither signal should infer
   opportunity from absence in a signup-driven regular war.
