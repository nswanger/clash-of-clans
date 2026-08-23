> Archived 2026-08-23 — CWL lineup-planning map (2026-07/08), resolved; durable choices are decision records 0009–0011. History only.

# Clash of Clans API Elder-role boundary

Research date: 2026-07-31

## Conclusion

The API field is `role`.

- In the clan roster/member response (`GET /v1/clans/{clanTag}/members`), it is a field on each `items[]` member object. The official API role token for the in-game Elder role is `admin`; the other clan-role tokens are `member`, `coLeader`, and `leader`.
- In the player profile response (`GET /v1/players/{playerTag}`), `role` is also available as the player’s current clan role. It is a top-level profile field, not a nested `clan.role` field.
- For this product, the member-list value should be the authoritative input for an Elder tie-breaker: that endpoint is explicitly scoped to the clan’s current roster. The player profile is useful corroboration/raw evidence, but it should not be a second competing source for lineup policy.

Primary API references:

- [Official Clash of Clans developer portal](https://developer.clashofclans.com/)
- [Official Swagger API reference](https://developer.clashofclans.com/api-docs/index.html) — the relevant operations are `GET /v1/clans/{clanTag}/members` and `GET /v1/players/{playerTag}`.
- The project’s [API endpoint inventory](../../../docs/api-endpoint-inventory.md#L5-L11) records that these endpoint shapes were confirmed in the authenticated official Swagger UI, including roster roles and player-profile clan role ([lines 17-23](../../../docs/api-endpoint-inventory.md#L17-L23), [lines 37-40](../../../docs/api-endpoint-inventory.md#L37-L40)).

The public Swagger shell was checked on the research date, but without a developer-session definition it reported “Unable to render this definition.” The official endpoint links above are therefore retained as the canonical verification target; the repository inventory is the local record of the authenticated schema inspection. No third-party API wrapper or secondary documentation is used here.

## What the current collector captures

The collector currently does more than the canonical recommendation path exposes:

1. `ClashMember` is intentionally loose: it requires only `tag`, `name`, and `townHallLevel`, with an index signature for additional API fields ([`apps/collector/src/clash-client.ts:25-45`](../../../apps/collector/src/clash-client.ts#L25-L45)). The client fetches the clan roster/member list and player profiles ([`apps/collector/src/clash-client.ts:90-100`](../../../apps/collector/src/clash-client.ts#L90-L100)).
2. Each successful member-list response is saved as an exact raw snapshot. The collector then fetches one player profile per roster member ([`apps/collector/src/collect.ts:191-201`](../../../apps/collector/src/collect.ts#L191-L201)). Therefore a returned `role` is present in the raw evidence for whichever endpoint returned it.
3. Member-list normalization explicitly copies `member.role` into the daily roster record ([`apps/collector/src/normalize.ts:144-175`](../../../apps/collector/src/normalize.ts#L144-L175)). The TypeScript boundary currently treats it as an optional arbitrary string ([`apps/collector/src/normalize.ts:59-71`](../../../apps/collector/src/normalize.ts#L59-L71)).
4. Player-profile normalization does not copy `profile.role`; it only enriches the daily row with war preference, war stars, attack wins, defense wins, Capital contributions, and Clan Games points ([`apps/collector/src/normalize.ts:178-203`](../../../apps/collector/src/normalize.ts#L178-L203)). The profile’s raw snapshot still exists, but its role is not in the normalized profile payload.
5. The daily history schema already has a nullable `member_daily_snapshots.role` column ([`supabase/migrations/202607190012_member_history.sql:11-40`](../../../supabase/migrations/202607190012_member_history.sql#L11-L40)). The daily roster RPC accepts and persists `role` ([`supabase/migrations/202607190012_member_history.sql:108-142`](../../../supabase/migrations/202607190012_member_history.sql#L108-L142)), and the roster overview exposes the latest role ([`supabase/migrations/202607190012_member_history.sql:232-252`](../../../supabase/migrations/202607190012_member_history.sql#L232-L252)).

So the role is already captured in raw snapshots and in daily member history when it arrives on the member-list response. It is not currently validated against the API enum or mapped from the API wire token to a product vocabulary.

## What is missing from canonical CWL/recommendation context

The CWL canonical member record is deliberately smaller. `MemberRecord` contains only clan, season, player tag, name, and Town Hall level ([`apps/collector/src/normalize.ts:13-20`](../../../apps/collector/src/normalize.ts#L13-L20)); league-group normalization writes only those fields ([`apps/collector/src/normalize.ts:206-223`](../../../apps/collector/src/normalize.ts#L206-L223)). The `cwl_members` table has no role column ([`supabase/migrations/202607110001_core_schema.sql:77-87`](../../../supabase/migrations/202607110001_core_schema.sql#L77-L87)).

The recommendation boundary is missing role in three aligned places:

- `memberFactsSchema` contains tag, name, Town Hall, availability, attack opportunity/completion counts, stars, and eight-star eligibility, but no role ([`packages/domain/src/domain.ts:34-57`](../../../packages/domain/src/domain.ts#L34-L57)).
- `get_recommendation_context` builds member facts from `cwl_members`, availability, reliability, and eight-star eligibility, but emits no role and does not join `member_roster_overview` ([`supabase/migrations/202607180009_recommendation_production.sql:151-183`](../../../supabase/migrations/202607180009_recommendation_production.sql#L151-L183)).
- The end-to-end acceptance fixture’s `cwl_members` rows and recommendation member facts likewise contain no role ([`tests/e2e/cwl-acceptance.spec.ts:188-220`](../../../tests/e2e/cwl-acceptance.spec.ts#L188-L220), [`tests/e2e/cwl-acceptance.spec.ts:238-243`](../../../tests/e2e/cwl-acceptance.spec.ts#L238-L243)).

The existing tests prove that a semantic string such as `"elder"` can pass through daily-history normalization ([`apps/collector/tests/normalize.test.ts:28-64`](../../../apps/collector/tests/normalize.test.ts#L28-L64)) and that daily SQL history stores it ([`supabase/tests/member_history_test.sql:13-61`](../../../supabase/tests/member_history_test.sql#L13-L61)). They do **not** prove that the official API sends `"elder"`, nor do they test the official wire token `"admin"`, profile-role normalization, an unknown role, or recommendation exposure. The fixture vocabulary must not be treated as API-schema evidence.

## Smallest safe Elder tie-breaker boundary

Recommended boundary for a future implementation:

1. Keep raw API snapshots unchanged.
2. At member-list normalization, validate the known API role tokens and map them once to a product enum such as `member | elder | coLeader | leader`; specifically map API `admin` to product `elder`. Preserve an unrecognized/missing value as `unknown`/`null`, never as Elder.
3. Reuse the already captured member-list role in daily history. Do not add a role to `cwl_members` merely because the season member row exists: season membership and current clan role have different grains, and role can change during a season.
4. Add the smallest recommendation input field needed for explanation, preferably nullable `clanRole` (plus the role observation/freshness provenance if the context can be stale), sourced from the latest successful current member-list observation for the same clan/player. The recommendation context should join the daily roster history/overview rather than use the player-profile role as a competing value.
5. Apply `clanRole === "elder"` only as a final tie-breaker among otherwise eligible and materially comparable candidates. It must not override availability, unknown availability, missed attacks/current-CWL reliability, rotation or eight-star goals, Town Hall fit, or an explicit leader choice. If role data is stale, missing, or unrecognized, omit the tie-breaker and make that limitation visible.

This is the smallest safe boundary because it uses an endpoint and normalized history the collector already has, avoids turning mutable role into season membership state, avoids an additional API call, prevents the API’s `admin` token from being confused with the application’s `admin` role, and keeps Elder as explainable evidence rather than an eligibility gate.

## Decision summary

| Question | Finding |
| --- | --- |
| Exact API field | `role` |
| Member-list availability | Yes; each current clan member object |
| Player-profile availability | Yes; current clan role on the profile |
| Current raw capture | Yes; exact member and profile response bodies are snapshotted |
| Current normalized capture | Member-list `role` only, in daily history; profile `role` is dropped |
| Current `cwl_members` capture | No role; only tag/name/Town Hall |
| Current recommendation context | No role field or role join |
| Safe Elder source | Current member-list role, mapped `admin` -> `elder`, with freshness/unknown handling |
| Safe policy | Final tie-breaker only; never an eligibility or override rule |
