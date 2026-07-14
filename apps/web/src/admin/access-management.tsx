import { useState } from "react";

interface Leader { id: string; name: string; role: "leader" | "admin" }
interface Props {
  leaders: Leader[];
  onCreateInvitation(): Promise<string>;
  onPromote(id: string): void;
  onRevoke(id: string): void;
}

export function AccessManagement({ leaders, onCreateInvitation, onPromote, onRevoke }: Props) {
  const [invitation, setInvitation] = useState<string>();
  const [invitationPending, setInvitationPending] = useState(false);
  const [invitationError, setInvitationError] = useState<string>();
  const [invitationStatus, setInvitationStatus] = useState<string>();
  const createInvitation = async () => {
    setInvitationPending(true);
    setInvitationError(undefined);
    setInvitationStatus("Creating invitation…");
    try {
      setInvitation(await onCreateInvitation());
      setInvitationStatus("Invitation created.");
    } catch (error) {
      setInvitationError(error instanceof Error ? error.message : "Unable to create invitation.");
      setInvitationStatus(undefined);
    } finally {
      setInvitationPending(false);
    }
  };

  return <main className="dashboard-shell access-management">
    <h1>Access management</h1>
    <button className="primary-button" type="button" disabled={invitationPending} onClick={() => void createInvitation()}>{invitationPending ? "Creating invitation…" : "Create invitation"}</button>
    {invitationStatus ? <p role="status" aria-live="polite">{invitationStatus}</p> : null}
    {invitationError ? <p className="dashboard-warning" role="alert">{invitationError}</p> : null}
    {invitation ? <aside className="season-summary"><strong>{invitation}</strong><button type="button" onClick={() => setInvitation(undefined)}>Dismiss invitation</button></aside> : null}
    <ul>{leaders.map((leader) => <li key={leader.id}>{leader.name} · {leader.role} {leader.role === "leader" ? <button type="button" onClick={() => onPromote(leader.id)}>Promote to admin</button> : null}<button type="button" onClick={() => onRevoke(leader.id)}>Revoke access</button></li>)}</ul>
  </main>;
}
