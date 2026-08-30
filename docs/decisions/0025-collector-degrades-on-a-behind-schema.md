---
status: accepted
date: 2026-08-30
deciders: [Nick]
type: structural
supersedes:
---
# The collector degrades when the database is behind, and says which migration is missing

[ADR 0003](0003-ci-reads-the-migration-ledger.md) closed the web app's half of the ordering problem: CI reads the remote migration ledger, so an unapplied migration blocks the Pages publish. **The collector's half was untouched.** It deploys by hand from UnRaid, no workflow is involved, and the only guard was a sentence in the runbook telling the operator to run `supabase migration list` first — the same class of guard that had already failed once on 2026-08-20.

The exposure was worse on this path because the failure is quiet. A collector calling a database function the remote schema does not have fails its normalized writes while its Clash attempts still record healthy: it looks like a working collector that is recording nothing. This settles [#81](https://github.com/nswanger/clash-of-clans/issues/81).

## Database CD stays out, for the credential reason again

Applying migrations automatically would dissolve the ordering problem on both paths, and it is still refused, for the reason ADR 0003 already established: it needs a credential in Actions that can alter the production schema — strictly larger than the read-only `migration_auditor`, whose worst-case disclosure is a list of filenames already public in this repository. In a public repo the workflow definition is readable by anyone looking for a misconfiguration to pry at.

It would not even close this gap. An auto-applied migration still races a hand-started container, and an operator can still start an image built from a commit the database is behind.

## The guard is outbound-only, so the exposure question does not arise

#81 anticipated a fight about CI reaching into UnRaid. There is nothing to fight about: the collector checks *itself*.

The image records the migration versions present when it was built. The database reports what it has applied through `public.applied_migration_versions()`, a `SECURITY DEFINER` function returning the same single column `migration_auditor` is limited to — version names, never the `statements` DDL — granted to `service_role` alone, so the browser app cannot enumerate the ledger. Anything baked and not applied is a migration this image needs and the database lacks.

No inbound port, no CI involvement, and **no new credential**: the collector already authenticates as `service_role`. The stated `docker port` invariant is untouched. This is deliberately the same comparison `scripts/check-migrations.sh` makes for the Pages path, so one definition of "behind" covers both.

A baked manifest was chosen over probing for the specific functions the collector calls. A probe only catches what startup happens to exercise and needs maintaining as call sites move; the manifest catches every missing migration and is generated, not written.

## Degrade, do not refuse

A schema-behind collector keeps capturing raw snapshots, skips normalized writes and recommendation generation, and reports `schema_behind`.

**Refusing to start was rejected because raw snapshots cannot be backfilled.** Missing a CWL collection window is permanent; a missed normalization is recoverable once the migration lands. Refusing would also turn a false positive in the check into an outage during the one week that matters. Recommendations are skipped alongside normalization because a recommendation built on canonical data the run could not write would be confidently wrong, which is worse than absent.

**Generic "unhealthy" is explicitly not the signal.** The container reported `unhealthy` continuously from 2026-08-09 to 2026-08-30 and nothing acted on it, because the signal was always red and carried no content ([#98](https://github.com/nswanger/clash-of-clans/pull/98)). A guard whose only output is "unhealthy" reproduces exactly that. `schema_behind` is a distinct state and names the versions to apply — they are filenames already in this repository, so nothing is disclosed by saying so.

Two consequences follow:

**The check runs per collection, not once at startup.** Applying the missing migration restores normalization on the next run rather than requiring the container be recreated.

**A ledger read that fails reports unknown and degrades nothing.** A schema that is behind stays behind, so the next run catches it; halting normalization on a transient RPC failure would be a new quiet fault of exactly the kind this removes. When the database is genuinely unreachable, the run's own writes fail loudly on their own. An image built without a manifest is likewise unknown, never behind — absence of evidence is not a penalty.

`verify-collector.sh` growing the check was considered and kept as a supplement, not the guard: it runs after the new image has started, so it detects rather than prevents.
