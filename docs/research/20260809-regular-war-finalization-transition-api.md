# Regular-war Finalization and `currentwar` Transition

Date: 2026-08-09

## Executive answer

The official API response model includes a `warEnded` state for the regular-war
`currentwar` resource. That means a post-end response is possible, and we
should try to capture it. However, the accessible Supercell documentation does
not promise how long that response remains available, whether it is retained
until a new war search starts, or what happens if a new war replaces it before
the next poll. We should therefore treat the end-of-war snapshot as
time-sensitive rather than as a guaranteed historical read.

The official API exposes REST reads only. I found no documented webhook,
event-subscription, or push-delivery mechanism for regular-war updates. A
polling collector remains the supported integration pattern.

## Findings

### `currentwar` after the war ends

The official API documentation describes the regular-war state machine as
including `preparation`, `inWar`, `warEnded`, and `notInWar`. The presence of
`warEnded` establishes that the endpoint can expose a completed war, but the
public documentation does not specify a retention guarantee or a fixed number
of hours for which the completed response remains readable.

This leaves two cases that must be handled as uncertain API behavior:

1. A poll observes `warEnded` and captures the final member/attack data.
2. The next poll observes `notInWar` or a different war before the collector
   saw `warEnded`.

The second case must be recorded using the evidence we actually have. A
`notInWar` response is not automatically incomplete: if the last member-level
snapshot was collected at or after the known `endTime`, the prior war is
recorded as `complete_at_transition`. It is recorded as `incomplete` only when
that last member snapshot predates `endTime` or no usable `endTime`/member
observation exists. This prevents a correct end-of-war poll from being marked
as a data-quality failure merely because the API had already moved to
`notInWar`.

### `warlog` detail level

Supercell's official 2021 API update explicitly documents `attacksPerMember`
on both `currentwar` and `warlog`, confirming that `warlog` contains more than
just a bare date/result identifier. It does not document `warlog` as a source
of member-level attack records.

The authorized `warlog` response captured for this project contained paginated
war-level summaries—result, timing, team size, attack settings, and
clan/opponent totals—but no member roster or per-player attack records. That
response should be treated as the observed behavior for this API access, not as
a promise that every historical war-log response has identical fields.

Conclusion: use `warlog` to recover war-level calendar and outcome context, but
do not backfill individual participation, attacks, or stars from it unless a
future authorized response demonstrably contains those fields.

### Webhooks, events, or push delivery

The official developer portal documents API keys/JWT authentication and REST
resource operations. Its public documentation contains no webhook registration,
event subscription, callback URL, or push-notification contract for clan wars.
There is therefore no official push mechanism we can design around today.

### Polling and rate limits

The official getting-started guidance says that API tokens are bound to rate
limitations and allowed IP addresses, and that exceeding those limitations
causes requests to fail. It recommends keeping keys private and using separate
keys for separate applications. The accessible public guidance does not state
a universal numeric quota or prescribe a polling interval for `currentwar`.

The collector should consequently:

- use one scheduled polling process rather than independent callers;
- avoid assuming a vendor-published minimum interval that is not documented;
- handle standard HTTP errors, including rate-limit responses, with backoff;
- keep polling state and collection timestamps so coverage can be audited; and
- avoid treating a missed poll as evidence that a member did not attack.

## Operational recommendation

Do not rely on the existing once-per-day refresh as the only finalization
opportunity. Add a narrow end-of-war collection window to the normal polling
schedule:

1. Continue regular-war polling every six hours during preparation and battle
   day, independent of the CWL hourly cadence.
2. When the observed `endTime` is approaching, schedule a final read at the
   boundary and retry five minutes later if the API still reports the war as
   active.
3. Persist every response idempotently, including the first `warEnded`
   response.
4. Continue a small number of post-end retries if the first end-time request
   is stale or rate-limited.
5. If a new war or `notInWar` appears before a complete member snapshot was
   observed, mark the prior war's member evidence as incomplete and preserve
   the uncertainty. A finalized war is never reclassified by a later retry.

This is a product/collector recommendation, not a Supercell guarantee. The
next empirical validation should observe several real transitions and record
only timestamps, states, and response-shape metadata. That will tell us how
long `warEnded` normally remains visible for this clan without baking an
unofficial retention assumption into the data model.

## Primary sources

- [Clash of Clans API developer portal](https://developer.clashofclans.com/)
- [Official API documentation / Swagger UI](https://developer.clashofclans.com/api-docs/index.html)
- [Supercell's official 2021 API update](https://supercell.com/en/games/clashofclans/blog/news/superbowler-qols/)
