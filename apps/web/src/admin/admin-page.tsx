/* The Admin route (`#/admin`), conformed to Clan Muster (#25, wave 3).
 *
 * `#/access` widened rather than being deleted (ADR 0002). It gains collection
 * health, which is where "is this data trustworthy" belongs beside "who can see
 * it" — and which is what closes #9, whose whole complaint is that
 * normalization errors are recorded and never surfaced.
 *
 * Conformed against the component inventory rather than against a prototype:
 * there is no prototype for this surface, and by wave 3 the inventory should
 * carry it. It did, with one finding recorded in components.md — the definition
 * list of one fact per row is `cwl-review-facts` and `members-facts` a third
 * time, and three uses is the point at which a page-layer pattern is either
 * promoted or deliberately left alone. It is left alone here and the reason is
 * written down, because each of the three has a different column count and grid
 * for a different reading, and a component that takes the grid as a parameter is
 * a `<div>` with extra steps.
 *
 * Nothing about the access model changed. Every mutation, confirmation and
 * error path is the one that was already here; what moved is the markup and the
 * stylesheet, in one commit, with the old `.access-*` block deleted in the same
 * one (#25's same-commit rule).
 */
import { useState } from "react";
import { AppTopbar } from "../app-chrome.js";
import {
  isCollectionUnhealthy,
  isExpectedIdleCwlPartial,
  type AccessAuditEvent,
  type AccessInvitation,
  type AccessManagementSnapshot,
  type AccessPerson,
  type CollectionHealth,
} from "../data/operations.js";
import "./admin.css";

interface Props {
  snapshot: AccessManagementSnapshot;
  collection: CollectionHealth | undefined;
  loadError: string | undefined;
  onRetryLoad(): Promise<void>;
  onCreateInvitation(): Promise<string>;
  onReissueInvitation(id: string): Promise<string>;
  onRevokeInvitation(id: string): Promise<void>;
  onPromote(id: string): Promise<void>;
  onDemote(id: string): Promise<void>;
  onRevokeAccess(id: string): Promise<void>;
  onCopyInvitation(value: string): Promise<void>;
  confirmAction(message: string): boolean;
}

interface FreshInvitation { url: string; action: "created" | "reissued" }

function formatInstant(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function actionError(error: unknown): string {
  return error instanceof Error ? error.message : "The access change could not be completed.";
}

/* The five marks (#19), and an access role or an invitation status is a
 * CATEGORY rather than an evaluation — so `redeemed` is success only because it
 * is the terminal good outcome of a link, and `pending` takes no colour at all.
 * There is no info pill in the system: info's one live form is the provenance
 * rail, which nothing here has. */
function statusVariant(status: string): string {
  if (status === "admin" || status === "redeemed") return "is-success";
  if (status === "expired" || status === "revoked") return "is-caution";
  return "";
}

function InvitationDetail({ invitation }: { invitation: AccessInvitation }) {
  if (invitation.status === "redeemed") return <>Redeemed by {invitation.usedByName} on {formatInstant(invitation.usedAt!)}</>;
  if (invitation.status === "revoked") return <>Revoked by {invitation.revokedByName} on {formatInstant(invitation.revokedAt!)}</>;
  if (invitation.status === "expired") return <>Expired {formatInstant(invitation.expiresAt)}</>;
  return <>Expires {formatInstant(invitation.expiresAt)}</>;
}

function AuditDescription({ event }: { event: AccessAuditEvent }) {
  const role = typeof event.eventData.role === "string" ? event.eventData.role : "access";
  const target = event.targetName ?? "an account";
  switch (event.eventType) {
    case "invitation_created": return <>{event.actorName} created an invitation</>;
    case "invitation_reissued": return <>{event.actorName} reissued an invitation</>;
    case "invitation_revoked": return <>{event.actorName} revoked an invitation</>;
    case "invitation_redeemed": return <>{event.actorName} redeemed an invitation</>;
    case "role_granted": return <>{event.actorName} granted {role} access to {target}</>;
    case "role_revoked": return <>{event.actorName} revoked {role} access from {target}</>;
  }
}

/* Collection health, moved here from the deleted dashboard.
 *
 * SURFACES MARK THE EXCEPTION. A healthy run gets one muted line stating when
 * the data was last fresh — which is a fact the reader needs in order to read
 * everything else — and nothing more. The per-endpoint breakdown appears only
 * when the run was not healthy, because a list of fifteen green endpoints is the
 * happy-path banner in table form.
 *
 * The failing attempts are what #9 asked for. `error_category` is the whole of
 * what the schema stores — the collector's own message is pushed onto
 * `internalErrors` and never persisted — so this says which endpoint failed and
 * how it was categorised, and stops there rather than inventing detail. */
function CollectionHealthSection({ collection }: { collection: CollectionHealth | undefined }) {
  if (!collection) return null;
  const unhealthy = isCollectionUnhealthy(collection);
  /* Between seasons the league group's 404 is the expected shape of a `partial`
     run, so the breakdown stays closed along with the banner. Listing the one
     attempt that failed for the ordinary reason would restate the happy path in
     table form, which is the thing this section already refuses to draw. */
  const failing = isExpectedIdleCwlPartial(collection)
    ? []
    : collection.attempts.filter((attempt) => attempt.status !== "healthy");
  return (
    <section className="cm-section admin-section" aria-labelledby="admin-collection-heading">
      <div className="cm-section-head">
        <h2 id="admin-collection-heading">Collection health</h2>
        {collection.status
          ? <span className={`cm-statuschip ${unhealthy ? "" : "is-on"}`}>{collection.status}</span>
          : null}
      </div>
      <p className="admin-freshness">
        {collection.lastFreshAt
          ? <>Data last observed fresh {formatInstant(collection.lastFreshAt)}.</>
          : <>No successful collection has been recorded.</>}
        {collection.startedAt ? <> Latest run started {formatInstant(collection.startedAt)}
          {collection.finishedAt ? <> and finished {formatInstant(collection.finishedAt)}</> : <>, still running</>}.</> : null}
      </p>
      {unhealthy
        ? <div className="cm-notice" role="alert">
            <div className="cm-grow">
              <strong>The latest collection run was not healthy</strong>
              <p>{collection.errorMessage
                ?? "Figures elsewhere in the app are as old as the last fresh observation above."}</p>
            </div>
          </div>
        : null}
      {failing.length
        ? <dl className="admin-facts">
            {failing.map((attempt) => <div key={`${attempt.endpoint}:${attempt.startedAt}`}>
              <dt>{attempt.endpoint}</dt>
              <dd>
                <span className="cm-statustext is-unavailable">{attempt.errorCategory ?? attempt.status}</span>
                {attempt.httpStatus === null ? null : <> <span className="cm-sep">·</span> HTTP {attempt.httpStatus}</>}
              </dd>
            </div>)}
          </dl>
        : null}
    </section>
  );
}

export function AdminPage({
  snapshot,
  collection,
  loadError,
  onRetryLoad,
  onCreateInvitation,
  onReissueInvitation,
  onRevokeInvitation,
  onPromote,
  onDemote,
  onRevokeAccess,
  onCopyInvitation,
  confirmAction,
}: Props) {
  const [freshInvitation, setFreshInvitation] = useState<FreshInvitation>();
  const [pendingActions, setPendingActions] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string>();

  const runAction = async (key: string, action: () => Promise<void>, success: string) => {
    setPendingActions((current) => ({ ...current, [key]: true }));
    setErrors((current) => { const next = { ...current }; delete next[key]; return next; });
    setStatus(undefined);
    try {
      await action();
      setStatus(success);
    } catch (error) {
      setErrors((current) => ({ ...current, [key]: actionError(error) }));
    } finally {
      setPendingActions((current) => { const next = { ...current }; delete next[key]; return next; });
    }
  };

  const createInvitation = () => runAction("invitation:create", async () => {
    setFreshInvitation({ url: await onCreateInvitation(), action: "created" });
  }, "Invitation created. Copy it now; the link is not stored.");

  const reissue = (invitation: AccessInvitation) => {
    if (!confirmAction("Reissue this invitation? The current link will stop working.")) return;
    void runAction(`invitation:${invitation.id}`, async () => {
      setFreshInvitation({ url: await onReissueInvitation(invitation.id), action: "reissued" });
    }, "Invitation reissued. Copy the replacement link now.");
  };

  const revokeInvite = (invitation: AccessInvitation) => {
    if (!confirmAction("Revoke this invitation? Its link will stop working.")) return;
    void runAction(`invitation:${invitation.id}`, () => onRevokeInvitation(invitation.id), "Invitation revoked.");
  };

  const demote = (person: AccessPerson) => {
    if (!confirmAction(`Demote ${person.name} to leader?`)) return;
    void runAction(`person:${person.id}`, () => onDemote(person.id), `${person.name} is now a leader.`);
  };

  const revokePerson = (person: AccessPerson) => {
    if (!confirmAction(`Revoke all access for ${person.name}?`)) return;
    void runAction(`person:${person.id}`, () => onRevokeAccess(person.id), `Access revoked for ${person.name}.`);
  };

  const copyInvitation = () => runAction("invitation:copy", () => onCopyInvitation(freshInvitation!.url), "Invitation link copied.");

  return <main className="cm-shell admin-page">
    <AppTopbar route="admin" eyebrow="Operations" title="Admin" />

    {/* The one notice region, danger only (#19). A load failure means what is on
        screen is stale or partial, which is the only thing on this page that can
        be wrong rather than merely absent. */}
    {loadError
      ? <div className="cm-notice" role="alert">
          <div className="cm-grow"><strong>Access data is out of date</strong><p>{loadError}</p></div>
          <button type="button" onClick={() => void onRetryLoad()}>Retry refresh</button>
        </div>
      : null}
    {errors["invitation:create"]
      ? <div className="cm-notice" role="alert">
          <div className="cm-grow"><strong>Invitation not created</strong><p>{errors["invitation:create"]}</p></div>
        </div>
      : null}

    <CollectionHealthSection collection={collection} />

    <section className="cm-section admin-section" aria-labelledby="admin-people-heading">
      <div className="cm-section-head">
        <h2 id="admin-people-heading">People <span className="cm-count">{snapshot.people.length}</span></h2>
        <button
          className="cm-button"
          type="button"
          disabled={pendingActions["invitation:create"]}
          onClick={() => void createInvitation()}
        >{pendingActions["invitation:create"] ? "Creating invitation…" : "Create invitation"}</button>
      </div>

      {/* The link is shown once and never stored, so it is not a notice and not
          a row: it is a thing to copy before it is gone. */}
      {freshInvitation
        ? <div className="admin-fresh" aria-label={`${freshInvitation.action} invitation`}>
            <p className="cm-panel-label">{freshInvitation.action === "created" ? "New invitation" : "Replacement invitation"}</p>
            <p className="admin-token">{freshInvitation.url}</p>
            <div className="admin-actions">
              <button className="cm-ghost" type="button" disabled={pendingActions["invitation:copy"]} onClick={() => void copyInvitation()}>Copy link</button>
              <button className="cm-ghost" type="button" onClick={() => setFreshInvitation(undefined)}>Dismiss</button>
            </div>
            {errors["invitation:copy"] ? <p className="admin-error" role="alert">{errors["invitation:copy"]}</p> : null}
          </div>
        : null}

      <div className="cm-rows">
        {snapshot.people.map((person) => {
          const key = `person:${person.id}`;
          const pending = pendingActions[key];
          return <div className="cm-row admin-row" key={person.id}>
            <span className="cm-row-main">
              <span className="cm-row-name">{person.name}</span>
              <span className="cm-row-meta">
                <span className={`cm-pill ${statusVariant(person.role)}`}>{person.role}</span>
                {person.isCurrentUser ? <><span className="cm-sep">·</span>Current account</> : null}
              </span>
              {errors[key] ? <span className="admin-error" role="alert">{errors[key]}</span> : null}
            </span>
            <span className="admin-actions">
              {!person.isCurrentUser && person.role === "leader"
                ? <button className="cm-ghost" type="button" disabled={pending} onClick={() => void runAction(key, () => onPromote(person.id), `${person.name} is now an admin.`)}>Promote to admin</button>
                : null}
              {!person.isCurrentUser && person.role === "admin"
                ? <button className="cm-ghost" type="button" disabled={pending} onClick={() => demote(person)}>Demote to leader</button>
                : null}
              {!person.isCurrentUser
                ? <button className="cm-ghost is-danger" type="button" disabled={pending} onClick={() => revokePerson(person)}>Revoke access</button>
                : null}
            </span>
          </div>;
        })}
      </div>
    </section>

    <section className="cm-section admin-section" aria-labelledby="admin-invitations-heading">
      <div className="cm-section-head">
        <h2 id="admin-invitations-heading">Invitation history <span className="cm-count">{snapshot.invitations.length}</span></h2>
      </div>
      {snapshot.invitations.length === 0
        ? <p className="cm-empty">No invitations have been created.</p>
        : <div className="cm-rows">
            {snapshot.invitations.map((invitation) => {
              const key = `invitation:${invitation.id}`;
              const pending = pendingActions[key];
              return <div className="cm-row admin-row" key={invitation.id}>
                <span className="cm-row-main">
                  <span className="cm-row-name">Invitation from {invitation.createdByName}</span>
                  <span className="cm-row-meta">
                    <span className={`cm-pill ${statusVariant(invitation.status)}`}>{invitation.status}</span>
                    <span className="cm-sep">·</span>Created {formatInstant(invitation.createdAt)}
                    <span className="cm-sep">·</span><InvitationDetail invitation={invitation} />
                    {invitation.reissuedInvitationId ? <><span className="cm-sep">·</span>Reissued with a replacement invitation</> : null}
                  </span>
                  {errors[key]
                    ? <span className="admin-error" role="alert">{errors[key]}{" "}
                        <button className="cm-ghost" type="button" onClick={() => void onRetryLoad()}>Refresh status</button>
                      </span>
                    : null}
                </span>
                {invitation.status === "pending"
                  ? <span className="admin-actions">
                      <button className="cm-ghost" type="button" disabled={pending} onClick={() => reissue(invitation)}>Reissue</button>
                      <button className="cm-ghost is-danger" type="button" disabled={pending} onClick={() => revokeInvite(invitation)}>Revoke</button>
                    </span>
                  : null}
              </div>;
            })}
          </div>}
      <p className="admin-freshness">Invitation links are never stored and cannot be recovered after they are dismissed.</p>
    </section>

    <section className="cm-section admin-section" aria-labelledby="admin-audit-heading">
      <div className="cm-section-head">
        <h2 id="admin-audit-heading">Recent access activity <span className="cm-count">{snapshot.auditEvents.length}</span></h2>
      </div>
      {snapshot.auditEvents.length === 0
        ? <p className="cm-empty">No access activity has been recorded.</p>
        : <ol className="admin-audit">
            {snapshot.auditEvents.map((event) => <li key={event.id}>
              <span><AuditDescription event={event} /></span>
              <time dateTime={event.occurredAt}>{formatInstant(event.occurredAt)}</time>
            </li>)}
          </ol>}
    </section>

    <p className="admin-live" role="status" aria-live="polite">{status ?? ""}</p>
  </main>;
}
