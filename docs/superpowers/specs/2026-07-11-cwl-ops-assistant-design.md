# CWL Operations Assistant Design

## Purpose

Build a low-maintenance leader dashboard for a casual Clash of Clans clan. The MVP helps leaders record availability, review daily CWL lineup changes, respond to missed attacks, rotate members toward eight stars, and complete a lightweight post-CWL Elder review.

The system advises rather than decides. Recommendations must be explainable, editable, and explicitly approved by a leader before anyone changes the in-game lineup.

## Scope

### MVP

- Collect the clan roster, player profiles, active CWL group, CWL war tags, and individual CWL war details.
- Record member availability as `Available`, `Unavailable`, or `Unknown` from leader-observed clan-chat responses.
- Configure season-level war size, target core size, rotation positions, priority mode, and eight-star rotation behavior.
- Produce daily, ordered-rule lineup recommendations.
- Let leaders approve or override recommendations and retain an audit record.
- Show stale-data, partial-data, and `403 invalidIp` collection warnings.
- Support a post-CWL Elder review based on completed and assigned attacks.
- Authenticate leaders with Discord OAuth and invitation-based access.
- Deploy the public frontend to GitHub Pages, store shared data in Supabase, and run the collector in Docker on UnRaid.

### Explicitly Deferred

- Regular-war collection and its use in reliability scoring.
- External alerts through Discord, email, or other services.
- Automatic WAN-IP remediation or Clash API key rotation.
- Weighted recommendation scoring or whole-lineup optimization.
- Numeric scoring controls, tuning sliders, and analytics-heavy dashboards.
- Automated in-game lineup changes.

Regular-war collection is the first data-oriented follow-up. It should initially capture and store history through the same raw-to-derived pipeline without influencing CWL recommendations until leaders approve a policy for using it.

## Product Policy

### Casual-Clan Defaults

- `Balanced` is the default priority mode for both 15- and 30-player CWL.
- `Standings-first` is an optional season override.
- A 15-player season defaults to `10 core + 5 rotation`.
- A 30-player season defaults to `20 core + 10 rotation`.
- Core and rotation counts are season settings, not permanent member classifications.
- Eight stars makes a member eligible to rotate out; it never forces simultaneous removal of reliable attackers.
- Recommendations preserve the configured target core unless a leader overrides them.

### Availability

- Leaders manually translate clan-chat responses into `Available`, `Unavailable`, or `Unknown`.
- An `Unavailable` member is never recommended.
- An `Unknown` member is not recommended into the lineup. The dashboard may place them on a contact list with supporting context.
- When no suitable `Available` substitute exists, the dashboard reports a coverage gap instead of fabricating a swap.

### Elder Review

- Six completed CWL attacks qualifies a member for Elder review.
- Assigned opportunities are displayed with completed and missed attacks.
- Leader-caused rotation does not count against a member.
- Promotion remains a human decision; the dashboard presents supporting facts.

## Architecture

### Components

1. **Clash API** provides clan, roster, player, CWL group, war-tag, war, and attack data.
2. **UnRaid collector** makes outbound-only requests to Clash and Supabase. It owns the Clash API credential and backend service credential.
3. **Supabase** provides Postgres storage, Discord-backed authentication, authorization policies, and shared operational state.
4. **GitHub Pages frontend** provides the authenticated leader dashboard. It contains no Clash API key or Supabase service credential.

### Security Boundary

- Secrets remain in UnRaid container configuration or an ignored local environment file during development.
- The browser uses only the public Supabase client configuration and the signed-in user's session.
- Supabase row-level security restricts reads and writes by role.
- Nick is bootstrapped as the first `admin`.
- An `admin` can create invitations, revoke access, and assign roles.
- A `leader` can view CWL data, manage availability, review recommendations, and approve or override decisions.
- A single-use, expiring invitation grants `leader` access after Discord OAuth.
- Invited leaders do not automatically become admins.
- The application cannot verify an invitee's in-game clan role. Admins are responsible for inviting only actual leaders and revoking inappropriate access.

### Recommendation Strategy Seam

Recommendation logic must sit behind a stable strategy interface. The interface accepts a complete recommendation context and returns proposed lineup changes, explanations, confidence notes, contacts, and coverage gaps.

The MVP strategy uses ordered rules. Storage, API, and frontend consumers must depend on the strategy contract rather than the ordered-rule implementation. A later weighted scorer or lineup optimizer can replace it without changing the persisted facts or dashboard response shape.

## Collection and Data Flow

### Schedule

- During the first CWL week, collect hourly.
- Outside CWL, collect the clan roster and player profiles daily.
- Regular-war details are excluded from MVP.
- The dashboard emphasizes the age of the latest successful collection, especially near the end of a war day.

### Pipeline

1. The scheduler starts a collection run.
2. The collector requests each required endpoint and records the outcome.
3. A successful API response is saved as a raw snapshot before facts are derived.
4. Normalization upserts stable entities and events using database-enforced unique identities.
5. Derived current-season facts are recomputed from canonical rows.
6. Collection health records the run status, successful endpoints, missing inputs, last-fresh time, and actionable error category.
7. The recommendation strategy reads a consistent derived view; it does not parse raw API responses directly.

### Storage Layers

#### Raw snapshots — 90 days

Store the endpoint, request identity, collection time, HTTP status, content fingerprint, and exact response body. Raw data supports debugging, replay, and recalculation.

#### Derived CWL history — indefinite

Store seasons, wars, members, lineup assignments, attacks, missed attacks, stars, destruction, and assigned opportunities. Derived facts remain auditable back to raw snapshots while those snapshots are retained.

#### Leader-owned operational state — indefinite

Store availability, season settings, recommendations, approvals, overrides, users, roles, invitations, and audit events.

## Data Integrity and Retry Safety

Idempotency is a correctness requirement because duplicated facts would corrupt missed-attack rates, opportunity counts, Elder review, and lineup suggestions.

- Define database unique constraints for every canonical identity, including season, war tag, war-member assignment, and individual attack.
- Use conflict-aware upserts against those constraints. Do not use an application-level check-then-insert sequence as the primary duplicate defense.
- Fingerprint raw responses so repeated identical payloads are recognizable.
- Make collection-run and endpoint-attempt records independently identifiable.
- Normalize related records within transactions where practical.
- Recompute derived metrics from canonical facts. Never increment attack, opportunity, star, or miss totals blindly during ingestion.
- A timeout, process restart, repeated schedule invocation, or retry after partial failure must converge on the same canonical database state.
- Replaying the same complete or partial fixtures must leave canonical row counts, derived metrics, and recommendations unchanged.

## Recommendation Rules

The ordered-rule strategy applies the following sequence:

1. Exclude `Unavailable` members.
2. Identify replacement needs, prioritizing assigned attackers who missed.
3. Preserve the configured target core.
4. Treat members at eight stars as rotation-eligible when rotation is enabled.
5. Rank eligible substitutes by current-CWL attack reliability.
6. Prefer members with fewer assigned opportunities in the current season.
7. Prefer a suitable Town Hall and map-position fit.
8. Resolve an exact remaining tie deterministically by player tag.

Reliability means using an assigned attack, not maximizing stars. It uses the current CWL only. When the season contains too few assigned attacks to support a strong conclusion, the recommendation reports limited confidence rather than importing regular-war or prior-CWL behavior.

`Balanced` protects the core and attack reliability while distributing opportunities toward eight-star rewards. `Standings-first` reduces reward-driven rotation and favors the most reliable suitable lineup. Hard availability exclusions and coverage-gap behavior apply in both modes.

Each recommendation stores structured reason codes and a short human explanation. A leader override stores the actor, timestamp, original recommendation, final choice, and optional note.

## Leader Workflow and UX

### Default Daily View

The default experience is a calm operational document rather than an analytics-heavy dashboard. It uses progressive disclosure and shows, in order:

- Current war context and data freshness.
- Four decision-useful daily KPIs: time remaining, attacks used, members available, and members at eight or more season stars.
- A compact season-position summary linking to the season detail page.
- Recommended lineup actions.
- A one-sentence reason per affected member.
- Blocking or confidence warnings when present.
- `Approve changes` and `Edit lineup` actions.

The KPI row must remain functional:

- `Time remaining` counts down to the active CWL war's API-provided `endTime`. It also shows the local end time and must not infer the deadline from a collection timestamp.
- `Attacks used` shows clan attacks made over the day's maximum attacks and uses positive progress framing.
- `Members available` counts confirmed available roster members. Unknown availability appears as secondary text such as `3 awaiting confirmation`.
- `Members at 8+ stars` counts season roster members who have reached the full medal threshold. When at least one member is within three stars of the threshold, secondary text shows that count; otherwise the secondary text is omitted.

Invariant or exceptional values do not occupy permanent KPI tiles. A full `15 / 15` or `30 / 30` lineup is assumed. A coverage gap means the strategy could not find an eligible substitute for a specific lineup position; it appears as a blocking warning only when present.

The compact season summary shows current group position, group size, stars, rounds remaining, and promotion/stay/demotion status only when the governing rule is explicitly configured and verified. Otherwise it shows position without predicting an outcome. The season detail page owns the full group table, star and destruction tie-break context, war record, remaining rounds, and member eight-star progress.

### Lineup Action Presentation

The strategy may calculate one-for-one substitutions internally to preserve lineup size and coverage. The leader-facing workflow batches those calculations into the order used in the game:

1. `Remove these members`.
2. `Add these members`.

Each group shows the member name, Town Hall level, and concise reason. Individual substitution pairings, coverage logic, rule order, confidence notes, and alternates stay behind `Why?`. The UI must not imply that leaders need to perform slower one-for-one swaps in the game.

### Explanation View

A `Why?` action reveals the applied rules, confidence note, and eligible alternate candidates. Detailed logic remains available for auditing and refinement without overwhelming a leader who wants only the suggested changes.

The MVP has no numeric recommendation score, tuning sliders, multi-stage approval workflow, or analytics-heavy landing page.

### Visual System

The approved direction adapts the visual language documented in `DESIGN-notion.md` to CWL operations:

- **Canvas:** warm paper-like `#f6f5f4` with white `#ffffff` surfaces.
- **Text:** near-black `#000000` primary ink, `#31302e` secondary ink, and restrained neutral supporting text.
- **Primary action:** `#0075de`; pressed/active state `#005bab`. Blue is reserved for the primary action and links.
- **Structure:** `#e6e6e6` hairline borders, primarily flat cards, 5–8px control radii, 8–12px card radii, and barely-there elevation only where layering needs clarification.
- **Typography:** Inter with the system sans-serif fallback stack. Headings use tight negative tracking; body and utility text remain neutral and readable.
- **Spacing:** a restrained 4px base scale with generous document-like whitespace and a centered desktop content column.
- **Signature element:** small clan-shield or Town Hall markers use the accent palette for subject-specific personality. Accent colors do not compete with primary actions or encode unsupported status semantics.

Desktop presents the four KPIs in one row and the remove/add groups side by side. Tablet and mobile preserve the same reading order: KPIs collapse to two columns, then the lineup actions stack vertically as remove followed by add. Primary actions remain reachable without horizontal scrolling.

All interactive controls require visible keyboard focus, accessible names, and at least a 44px touch target on compact layouts. Motion is limited to functional state transitions and respects reduced-motion preferences. Loading, empty, stale, `invalidIp`, unknown-contact, limited-confidence, and coverage-gap states must preserve the same hierarchy rather than replacing the page with ambiguous generic errors.

## Failure Behavior

- **Stale data:** retain the last valid facts, display their age, and do not present a stale recommendation as current.
- **`403 invalidIp`:** show a specific in-app warning instructing an admin to update the Clash developer key allowlist for the home's current public WAN IP.
- **Partial endpoint failure:** persist successful responses, record missing inputs, and suppress only recommendations that require unavailable facts.
- **Duplicate or repeated pull:** rely on fingerprints, unique constraints, upserts, and recomputation so facts are not double-counted.
- **Unknown availability:** show a contact-needed state rather than silently treating the member as available.
- **No substitute:** show a coverage gap and relevant contact list.

External notifications and automated recovery are follow-ups. MVP health information remains inside the dashboard.

## Verification Strategy

### Recommendation Tests

- Unit-test every ordered rule and tie-break.
- Cover 15- and 30-player seasons in `Balanced` and `Standings-first` modes.
- Cover unavailable members, unknown contacts, missed attackers, eight-star rotation, insufficient current-season history, core preservation, and coverage gaps.
- Use snapshot or structured-result assertions for explanations as well as lineup outputs.

### Data Integrity Tests

- Replay identical complete responses and confirm canonical row counts do not change.
- Interrupt a fixture-driven collection after each normalization boundary, retry it, and confirm the final database matches a clean run.
- Replay changed war states and confirm attacks are updated or appended only according to their canonical identity.
- Confirm derived metrics and recommendations are identical after clean, duplicate, and partial-failure retry paths.

### Authorization Tests

- Cover admin, leader, revoked user, unauthenticated user, expired invitation, and reused invitation behavior.
- Verify that leader permissions do not include access administration.

### Collector and End-to-End Tests

- Use saved API fixtures for successful, incomplete, stale, and `403 invalidIp` responses.
- Smoke-test the full path: collect fixtures, normalize facts, record availability, generate recommendations, and approve or override a decision.
- Test responsive layout, keyboard navigation, accessible labeling, progressive disclosure, and loading/empty/error states.

## Delivery Shape

This remains one cohesive product design because every component supports the same daily CWL decision workflow. Implementation should be divided into independently verifiable phases rather than attempted as one large change:

1. Repository foundation and local tooling.
2. Supabase schema, migrations, authorization, and seed/bootstrap flow.
3. Clash client, raw collection, normalization, and idempotency tests.
4. Derived CWL metrics and the recommendation strategy contract.
5. Ordered-rule strategy and scenario tests.
6. Authenticated dashboard and progressive-disclosure UX.
7. UnRaid packaging, deployment, scheduling, and runbook.
8. End-to-end verification and production handoff.

## UnRaid Deployment and Operator Runbook

UnRaid deployment is a separate implementation workstream with its own verification and handoff. It should use Nick's existing Mac-to-UnRaid SSH authentication when available and when Nick authorizes changes to the server. If remote automation is unavailable, the same workstream must provide exact UI and shell instructions that Nick can execute manually.

### Information and Configuration Nick Must Supply

- UnRaid hostname or IP address and SSH username.
- Confirmation that the existing SSH identity can reach the server.
- Preferred persistent app-data directory and Docker network conventions.
- Clash API token and confirmation of the current public WAN IP allowlist.
- Supabase project URL and backend service credential.
- Desired container name, timezone, and any UnRaid naming conventions.
- Backup destination or confirmation that Supabase-managed backups are sufficient for MVP.

Secrets must be entered through UnRaid container variables, a protected server-side environment file, or an equivalent secret mechanism. They must not be committed or printed into logs.

### Deployment Deliverables

- A versioned collector image or reproducible container build.
- Persistent configuration and state paths documented for UnRaid.
- Environment-variable reference with required and optional values.
- An hourly CWL schedule and daily off-season behavior implemented inside the collector or through a documented scheduler, with only one active scheduling authority.
- Startup, health-check, log-inspection, update, rollback, and uninstall instructions.
- Connectivity checks for Clash and Supabase.
- A first-run verification that writes a raw snapshot, derives canonical facts, and reports healthy collection status.
- A retry/idempotency verification using the deployed container.
- Troubleshooting steps for DNS, outbound connectivity, `403 invalidIp`, invalid credentials, schema mismatch, and partial endpoint failure.

The UnRaid server requires no inbound public port for the collector. It makes outbound HTTPS requests only. GitHub Pages clients connect directly to Supabase under authenticated row-level security policies.

## Success Criteria

- A leader can sign in, record availability, see fresh CWL facts, and receive a concise proposed lineup change.
- A leader can understand why a change was proposed, inspect alternatives, and approve or override it.
- Unavailable members are never recommended.
- Missed assigned attacks take replacement priority.
- Eight-star rotation preserves the configured core unless overridden.
- Insufficient or stale inputs are visible and do not generate falsely confident recommendations.
- Repeated and partial-failure collection runs do not duplicate canonical facts or change derived outcomes.
- Collector credentials remain outside the frontend and repository.
- Nick can deploy, verify, update, and troubleshoot the UnRaid collector using either authorized SSH automation or the documented manual runbook.
