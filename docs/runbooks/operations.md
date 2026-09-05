# CWL Operations Runbook

This runbook covers the human-operated CWL workflow. Record operational evidence without secrets, real clan or player tags, or private member notes. Use neutral identifiers or aggregate counts when an incident record needs examples.

## Operating policy

- **Default strategy:** use **Balanced** with the season defaults — 10 core + 5 rotation for 15-player, 20 core + 10 rotation for 30-player ([0007](../decisions/0007-cwl-war-size-policy-defaults.md)).
- **Standings-first:** use only when a leader explicitly approves it as a policy override. Record who approved it, when, and why.
- **Human control:** the lineup workspace ranks the bench and flags bonus progress with visible reasons; a leader makes every lineup, bonus, promotion, and demotion decision. The system never assigns, benches, promotes, or demotes anyone on its own ([0026](../decisions/0026-retire-the-recommendation-engine.md)).
- **Availability:** enter availability on the CWL route (`#/cwl`). Players marked `Unknown` or `Unavailable` rank below available members on the bench and are flagged on their row. Capture notes carefully: keep them operational, minimal, and free of sensitive personal information.
- **Authority:** admins maintain access, service configuration, and operational health. Clan leaders approve lineup policy, invitations, promotions, demotions, and membership decisions. Admin access does not confer clan-policy authority.

## Pre-season checklist

- [ ] Confirm collector scheduling and deployment health using the [UnRaid runbook](unraid.md).
- [ ] Confirm Supabase connectivity, migrations, and expected tables using the [Supabase runbook](supabase.md).
- [ ] Run `supabase migration list` and confirm every local migration has a matching remote entry. Pages deploys on merge and the database does not, so an unapplied migration surfaces as a runtime failure on whichever route reads it. CI now fails on this too ([ADR 0003](../decisions/0003-ci-reads-the-migration-ledger.md)); the checklist item still matters for the collector, whose UnRaid deploy no workflow gates.
- [ ] Verify the collector's last successful run and data freshness before planning a lineup.
- [ ] Confirm Balanced is selected and the roster size maps to 10 core + 5 rotation for 15, or 20 core + 10 rotation for 30.
- [ ] If Standings-first is needed, obtain and record an explicit leader policy override.
- [ ] Record member availability on the CWL route; review `Unknown` and `Unavailable` entries before lineup work.
- [ ] Confirm the raw-snapshot cleanup schedule is enabled and Cron shows the expected next run.
- [ ] Confirm the canonical history and audit events remain outside the cleanup scope.

Evidence to record: season label, collector completion time, freshness check, aggregate availability counts, selected strategy, roster size, override approval if any, Cron status, and operator initials. Do not record secrets, real tags, or private member details.

## Season creation and freshness

After a successful CWL collection, the collector creates the season record when needed. There is no manual season-creation control and no season surface ([0002](../decisions/0002-app-surfaces-and-cwl-phase.md)).

Before making decisions:

- Verify that the displayed season matches the intended CWL month.
- Verify the most recent successful collection time and the dashboard freshness indicator.
- Treat stale, partial, or uncertain data as a blocker to lineup decisions. Continue only with an explicit, documented human assessment.

## Daily CWL checklist

- [ ] Confirm the current season, war day, collector status, and freshness.
- [ ] Review availability changes and resolve `Unknown` entries before filling from the bench.
- [ ] Build the day's lineup on the CWL route: the bench is ranked by rotation need, then availability, then rating, and each row shows its bonus progress.
- [ ] Save the plan, then work the in-game checklist as each change is made in Clash.
- [ ] Confirm the resulting lineup matches the selected Balanced allocation unless a current Standings-first override exists.
- [ ] Review assigned attacks and completed attacks for the current CWL only.
- [ ] Record the decision evidence in the application; do not keep a parallel file containing tags or private notes.

Evidence to record: run timestamp, freshness state, aggregate availability changes, the saved plan revision, and operator. Avoid copying member-private data into external logs.

## Elder review

Six or more completed CWL attacks qualifies a member for review; qualification is not an automatic promotion and fewer than six is not an automatic demotion ([0008](../decisions/0008-promotion-review-signals.md)). Leaders review the current-CWL evidence, exceptions, and clan context before approving any promotion or demotion. Record the final leader decision and a concise reason without private member information.

## Invitations, promotions, and access revocation

- **Invitation:** an admin may provision application access after a leader confirms the intended clan role and scope. Create the invitation from `#/admin` and copy the displayed link before dismissing it; plaintext links are never stored and cannot be recovered later. The history shows pending, redeemed, expired, and revoked states. Reissuing a pending invitation disables the original link and displays one replacement link.
- **Application-role promotion to admin:** only an existing application admin may promote an invited leader. After Nick explicitly approves the added operational authority, open `#/admin`, confirm the intended account, and select **Promote to admin**. Verify the account is shown as `admin` and can open access management; record the approver, operator, account identifier, timestamp, and reason. This changes application access only and does not authorize clan-policy or in-game role decisions.
- **Promotion or demotion:** only a clan leader approves game-role changes. The application can summarize evidence but must not execute or imply the decision.
- **Application-role demotion and revocation:** use **Demote to leader** when an admin should retain ordinary leader access; use **Revoke access** to remove every application role. Administrators cannot demote or revoke their own account, and the database preserves at least one admin. Rotate affected credentials when shared access may have been exposed.
- Record the action type, approving authority, operator, timestamp, and non-sensitive reason in the audit trail.

## Audit evidence

The Admin route (`#/admin`) shows invitation and application-role history under **Recent access activity**. For broader operational evidence, use the Supabase table viewer to correlate:

- `audit_events` for the operational action trail, including lineup plan saves, locks, and applied-lineup changes;
- `cwl_daily_lineup_plans` and `cwl_applied_lineup_changes` for the plan of record and what was done in game.

Filter by season, war day, and timestamp where those fields are present in the deployed schema. Do not invent queries against assumed columns; inspect the table definitions in Supabase first. Export only the minimum evidence needed, redact tags and private notes, and never include tokens or keys.

## Post-season checklist

- [ ] Confirm the final CWL collection completed and derived history is current.
- [ ] Reconcile lineup plans, applied-lineup changes, and audit events for missing or unexplained actions.
- [ ] Run the Elder review using current-CWL assigned-attack completion; send every promotion or demotion to human review.
- [ ] Confirm raw snapshots older than 90 days are scheduled for cleanup.
- [ ] Verify canonical history and audit events are retained indefinitely.
- [ ] Verify Cron reports successful collection and retention jobs; investigate missed schedules.
- [ ] Record lessons or policy changes separately for leader approval before altering the bench ranking or bonus rules.

Evidence to record: final collection/freshness state, aggregate attack completion, reviewed decision counts, exceptions, retention-job result, and approved follow-ups. Do not record secrets, real tags, or private member information.

## Recovery checklist

### Stale, partial, or `invalidIp`

- [ ] Stop making lineup decisions from the app until season and freshness are verified.
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
- Follow the [Supabase runbook](supabase.md), and verify canonical history, lineup plans, and audit events after recovery.

### Collector deployment rollback

Deploy the collector from an immutable image reference, preferably a digest. The collector exposes no ports and rollback must not delete volumes.

1. Record the current and target image references.
2. Update the UnRaid container to the tested immutable image following the [UnRaid runbook](unraid.md).
3. Verify configuration and secrets remain referenced, not embedded.
4. Run the documented collector acceptance check and confirm freshness.
5. If verification fails, restore the previous immutable image reference and re-run the check.

Do not delete containers, databases, volumes, or raw snapshots as part of an image rollback.

## Retention

Raw snapshots have a 90-day scheduled cleanup window. Canonical history, lineup plans, and audit events are retained indefinitely under the current policy. Verify the cleanup Cron schedule, last result, and next run; do not manually bulk-delete production data to compensate for a missed job.

## Regular-war evidence

Regular-war records feed separate activity and performance gauges used for CWL and member review; signup owns opportunity, so absence is not poor performance, and the war log cannot backfill member activity ([0001](../decisions/0001-cwl-evidence-and-bonus-priority.md)). Review the activity, CWL-rating, and bonus-priority explanations before approving a lineup or bonus decision.
