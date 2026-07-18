# CWL Operations Runbook

This runbook covers the human-operated CWL workflow. Record operational evidence without secrets, real clan or player tags, or private member notes. Use neutral identifiers or aggregate counts when an incident record needs examples.

## Operating policy

- **Default strategy:** use **Balanced**. A 15-player lineup uses 10 core and 5 rotation places; a 30-player lineup uses 20 core and 10 rotation places.
- **Standings-first:** use only when a leader explicitly approves it as a policy override. Record who approved it, when, and why.
- **Human control:** recommendations explain reasons, tradeoffs, freshness, and uncertainty. A leader must approve or override each consequential decision; the system must not silently assign, bench, promote, or demote anyone.
- **Availability:** enter availability through the dashboard availability route. Players marked `Unknown` or `Unavailable` are never recommended into a lineup. Capture notes carefully: keep them operational, minimal, and free of sensitive personal information.
- **Authority:** admins maintain access, service configuration, and operational health. Clan leaders approve lineup policy, invitations, promotions, demotions, and membership decisions. Admin access does not confer clan-policy authority.

## Pre-season checklist

- [ ] Confirm collector scheduling and deployment health using the [UnRaid runbook](unraid.md).
- [ ] Confirm Supabase connectivity, migrations, and expected tables using the [Supabase runbook](supabase.md).
- [ ] Verify the collector's last successful run and data freshness before using any recommendation.
- [ ] Confirm Balanced is selected and the roster size maps to 10 core + 5 rotation for 15, or 20 core + 10 rotation for 30.
- [ ] If Standings-first is needed, obtain and record an explicit leader policy override.
- [ ] Ask members to update availability through the dashboard route; review `Unknown` and `Unavailable` entries before lineup work.
- [ ] Confirm the raw-snapshot cleanup schedule is enabled and Cron shows the expected next run.
- [ ] Confirm the canonical and leader-decision history remains outside the cleanup scope.

Evidence to record: season label, collector completion time, freshness check, aggregate availability counts, selected strategy, roster size, override approval if any, Cron status, and operator initials. Do not record secrets, real tags, or private member details.

## Season creation and freshness

After a successful CWL collection, the collector automatically creates the season record when needed. The current `#/season` value is informational; it is not a manual season-creation control.

Before making decisions:

- Verify that the displayed season matches the intended CWL month.
- Verify the most recent successful collection time and the dashboard freshness indicator.
- Treat stale, partial, or uncertain data as a blocker to automatic recommendation use. Continue only with an explicit, documented human assessment.

## Daily CWL checklist

- [ ] Confirm the current season, war day, collector status, and freshness.
- [ ] Review availability changes and resolve `Unknown` entries; never recommend `Unknown` or `Unavailable` players in.
- [ ] Review each proposed lineup change with its stated reasons, tradeoffs, and uncertainty.
- [ ] Approve the recommendation or enter a leader override with a concise operational reason.
- [ ] Confirm the resulting lineup matches the selected Balanced allocation unless a current Standings-first override exists.
- [ ] Review assigned attacks and completed attacks for the current CWL only.
- [ ] Record the decision evidence in the application; do not keep a parallel file containing tags or private notes.

Evidence to record: run timestamp, freshness state, aggregate availability changes, recommendation identifier, approval or override, reason category, and operator. Avoid copying member-private data into external logs.

## Elder review

Elder eligibility is based on completion of assigned attacks in the current CWL. Under the current policy, six or more completed CWL attacks qualifies a member for review. Qualification is not an automatic promotion, and fewer than six attacks is not an automatic demotion.

Leaders review the current-CWL evidence, exceptions, and clan context before approving any promotion or demotion. Record the final leader decision and a concise reason without private member information.

## Invitations, promotions, and access revocation

- **Invitation:** an admin may provision application access after a leader confirms the intended clan role and scope. Use the least privilege needed.
- **Promotion or demotion:** only a clan leader approves game-role changes. The application can summarize evidence but must not execute or imply the decision.
- **Revocation:** admins promptly revoke application access when a leader confirms departure, role loss, or suspected compromise. Rotate affected credentials when shared access may have been exposed.
- Record the action type, approving authority, operator, timestamp, and non-sensitive reason in the audit trail.

## Audit evidence

There is no dedicated audit screen. Use the dashboard and Supabase table viewer to correlate:

- `recommendations` for the generated proposal and its reasons or uncertainty;
- `leader_decisions` for approvals, overrides, and the leader's recorded rationale;
- `audit_events` for the operational action trail.

Filter by season, recommendation or decision identifier, and timestamp where those fields are present in the deployed schema. Do not invent queries against assumed columns; inspect the table definitions in Supabase first. Export only the minimum evidence needed, redact tags and private notes, and never include tokens or keys.

## Post-season checklist

- [ ] Confirm the final CWL collection completed and derived history is current.
- [ ] Reconcile recommendations, leader decisions, and audit events for missing or unexplained actions.
- [ ] Run the Elder review using current-CWL assigned-attack completion; send every promotion or demotion to human review.
- [ ] Confirm raw snapshots older than 90 days are scheduled for cleanup.
- [ ] Verify canonical history, recommendation history, and leader-decision history are retained indefinitely.
- [ ] Verify Cron reports successful collection and retention jobs; investigate missed schedules.
- [ ] Record lessons or policy changes separately for leader approval before altering recommendation behavior.

Evidence to record: final collection/freshness state, aggregate attack completion, reviewed decision counts, exceptions, retention-job result, and approved follow-ups. Do not record secrets, real tags, or private member information.

## Recovery checklist

### Stale, partial, or `invalidIp`

- [ ] Stop using recommendations until season and freshness are verified.
- [ ] Determine whether a partial result is the expected idle-CWL `404` or an unexpected partial collection. An idle-CWL `404` can be recorded as expected partial state; missing data during an active CWL requires investigation.
- [ ] For `invalidIp`, verify the Clash API allowlisted public IP and collector egress using the [UnRaid runbook](unraid.md). Never paste a token into logs or screenshots.
- [ ] Verify Supabase and collector health, then run only the documented recovery/acceptance procedure.
- [ ] Confirm a fresh successful snapshot and derived update before resuming decisions.
- [ ] Record incident timing, status category, aggregate impact, verification performed, and resolution without secrets or member-private data.

### Credential rotation

Rotate credentials in an order that keeps the replacement available before the old value is revoked:

1. Create the replacement credential in the authoritative provider.
2. Update the deployment secret using the [UnRaid runbook](unraid.md) for the Clash token or the [Supabase runbook](supabase.md) for Supabase keys.
3. Restart or redeploy only the affected service and verify a safe acceptance check.
4. Revoke the old credential after verification.
5. Check logs and audit evidence for unexpected access, without exposing either credential.

Never expose secrets in source control, shell history, screenshots, issue comments, or operational evidence.

### Database backup and restore

Treat Supabase backups as the recovery source and confirm the project's actual backup tier, retention, and restore capability before relying on them.

- Never run a production database reset.
- Never edit an applied migration. Add a forward-fix migration and dry-run it against an isolated environment.
- Assess the affected scope, data-loss window, dependencies, and stakeholder approval before restoring.
- Restore only after the scope assessment shows that targeted repair or forward correction is insufficient.
- Follow the [Supabase runbook](supabase.md), and verify canonical history, leader decisions, and audit events after recovery.

### Collector deployment rollback

Deploy the collector from an immutable image reference, preferably a digest. The collector exposes no ports and rollback must not delete volumes.

1. Record the current and target image references.
2. Update the UnRaid container to the tested immutable image following the [UnRaid runbook](unraid.md).
3. Verify configuration and secrets remain referenced, not embedded.
4. Run the documented collector acceptance check and confirm freshness.
5. If verification fails, restore the previous immutable image reference and re-run the check.

Do not delete containers, databases, volumes, or raw snapshots as part of an image rollback.

## Retention

Raw snapshots have a 90-day scheduled cleanup window. Canonical history, recommendation history, and leader-decision history are retained indefinitely under the current policy. Verify the cleanup Cron schedule, last result, and next run; do not manually bulk-delete production data to compensate for a missed job.

## Regular-war fast-follow

Regular-war support should reuse the same raw-to-derived history pipeline. Keep regular-war records identifiable and auditable, and do not let regular-war observations affect CWL recommendations until leaders approve an explicit policy and the scoring behavior is implemented, tested, and documented.
