> Archived 2026-08-23 — CWL lineup-planning map (2026-07/08), resolved; durable choices are decision records 0009–0011. History only.

Type: research
Status: resolved

## Question

Where should the Clash API clan role—including Elder—be captured, normalized, exposed, and versioned for CWL recommendations, and what does the existing implementation currently omit? Confirm the API field, fixture shape, canonical storage boundary, and safe recommendation input.

## Answer

Research findings are recorded in [Elder Role API research](../research/elder-role-api.md).

The API field is `role`. The member-list endpoint is the authoritative source for the current clan roster; the player profile also exposes role, but should remain corroborating raw evidence rather than a competing recommendation input. The official API’s Elder wire token is `admin`, which must not be confused with this application’s `admin` access role.

The current collector saves raw member and profile responses. Member-list normalization already copies role into the indefinitely retained daily member history, but treats it as an arbitrary string. The canonical `cwl_members` table and recommendation context omit role entirely; profile normalization also drops profile role.

Smallest safe future boundary:

- Preserve raw snapshots unchanged.
- At member-list normalization, map the known wire roles to a product vocabulary such as `member`, `elder`, `coLeader`, `leader`; map API `admin` to product `elder`.
- Preserve missing, stale, or unrecognized role as unknown/null rather than assuming Elder.
- Join the latest current member-list role into recommendation context without adding mutable role to season membership state.
- Use Elder only as the final tie-breaker among otherwise eligible comparable candidates, with freshness/unknown limitations visible.

No production code was changed by this research ticket.
