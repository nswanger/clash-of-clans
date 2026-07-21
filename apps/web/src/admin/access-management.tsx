import { useState } from "react";
import type {
  AccessAuditEvent,
  AccessInvitation,
  AccessManagementSnapshot,
  AccessPerson,
} from "../data/operations.js";

interface Props {
  snapshot: AccessManagementSnapshot;
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

function InvitationDetail({ invitation }: { invitation: AccessInvitation }) {
  if (invitation.status === "redeemed") return <span>Redeemed by {invitation.usedByName} on {formatInstant(invitation.usedAt!)}</span>;
  if (invitation.status === "revoked") return <span>Revoked by {invitation.revokedByName} on {formatInstant(invitation.revokedAt!)}</span>;
  if (invitation.status === "expired") return <span>Expired {formatInstant(invitation.expiresAt)}</span>;
  return <span>Expires {formatInstant(invitation.expiresAt)}</span>;
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

export function AccessManagement({
  snapshot,
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

  return <main className="dashboard-shell access-management">
    <header className="access-heading">
      <div><p className="eyebrow">Administration</p><h1>Access management</h1></div>
      <button className="primary-button" type="button" disabled={pendingActions["invitation:create"]} onClick={() => void createInvitation()}>
        {pendingActions["invitation:create"] ? "Creating invitation…" : "Create invitation"}
      </button>
    </header>

    {status ? <p className="operational-state" role="status" aria-live="polite">{status}</p> : null}
    {errors["invitation:create"] ? <p className="dashboard-warning" role="alert">{errors["invitation:create"]}</p> : null}
    {loadError ? <div className="dashboard-warning" role="alert">{loadError} <button type="button" onClick={() => void onRetryLoad()}>Retry refresh</button></div> : null}

    {freshInvitation ? <aside className="fresh-invitation" aria-label={`${freshInvitation.action} invitation`}>
      <div><strong>{freshInvitation.action === "created" ? "New invitation" : "Replacement invitation"}</strong><p>{freshInvitation.url}</p></div>
      <div className="access-actions">
        <button type="button" disabled={pendingActions["invitation:copy"]} onClick={() => void copyInvitation()}>Copy link</button>
        <button type="button" onClick={() => setFreshInvitation(undefined)}>Dismiss</button>
      </div>
      {errors["invitation:copy"] ? <p className="inline-error" role="alert">{errors["invitation:copy"]}</p> : null}
    </aside> : null}

    <section className="access-section" aria-labelledby="access-people-heading">
      <div className="access-section-heading"><h2 id="access-people-heading">People</h2><span>{snapshot.people.length} with access</span></div>
      <ul className="access-list">
        {snapshot.people.map((person) => {
          const key = `person:${person.id}`;
          const pending = pendingActions[key];
          return <li key={person.id}>
            <div className="access-item-copy"><strong>{person.name}</strong><span className={`access-status ${person.role}`}>{person.role}</span>{person.isCurrentUser ? <small>Current account</small> : null}</div>
            <div className="access-actions">
              {!person.isCurrentUser && person.role === "leader" ? <button type="button" disabled={pending} onClick={() => void runAction(key, () => onPromote(person.id), `${person.name} is now an admin.`)}>Promote to admin</button> : null}
              {!person.isCurrentUser && person.role === "admin" ? <button type="button" disabled={pending} onClick={() => demote(person)}>Demote to leader</button> : null}
              {!person.isCurrentUser ? <button className="danger-button" type="button" disabled={pending} onClick={() => revokePerson(person)}>Revoke access</button> : null}
            </div>
            {pending ? <p role="status">Saving access change…</p> : null}
            {errors[key] ? <p className="inline-error" role="alert">{errors[key]}</p> : null}
          </li>;
        })}
      </ul>
    </section>

    <section className="access-section" aria-labelledby="invitation-history-heading">
      <div className="access-section-heading"><h2 id="invitation-history-heading">Invitation history</h2><span>Links are never stored</span></div>
      {snapshot.invitations.length === 0 ? <p className="access-empty">No invitations have been created.</p> : <ul className="access-list invitation-list">
        {snapshot.invitations.map((invitation) => {
          const key = `invitation:${invitation.id}`;
          const pending = pendingActions[key];
          return <li key={invitation.id}>
            <div className="access-item-copy">
              <strong>Invitation from {invitation.createdByName}</strong>
              <span className={`access-status ${invitation.status}`}>{invitation.status}</span>
              <small>Created {formatInstant(invitation.createdAt)} · <InvitationDetail invitation={invitation} /></small>
              {invitation.reissuedInvitationId ? <small>Reissued with a replacement invitation</small> : null}
            </div>
            {invitation.status === "pending" ? <div className="access-actions">
              <button type="button" disabled={pending} onClick={() => reissue(invitation)}>Reissue</button>
              <button className="danger-button" type="button" disabled={pending} onClick={() => revokeInvite(invitation)}>Revoke</button>
            </div> : null}
            {pending ? <p role="status">Updating invitation…</p> : null}
            {errors[key] ? <p className="inline-error" role="alert">{errors[key]} <button type="button" onClick={() => void onRetryLoad()}>Refresh status</button></p> : null}
          </li>;
        })}
      </ul>}
    </section>

    <section className="access-section" aria-labelledby="access-audit-heading">
      <div className="access-section-heading"><h2 id="access-audit-heading">Recent access activity</h2><span>Latest {snapshot.auditEvents.length} events</span></div>
      {snapshot.auditEvents.length === 0 ? <p className="access-empty">No access activity has been recorded.</p> : <ol className="audit-list">
        {snapshot.auditEvents.map((event) => <li key={event.id}>
          <span><AuditDescription event={event} /></span>
          <time dateTime={event.occurredAt}>{formatInstant(event.occurredAt)}</time>
        </li>)}
      </ol>}
    </section>
  </main>;
}
