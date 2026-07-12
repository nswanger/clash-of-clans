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
  return <main className="dashboard-shell">
    <h1>Access management</h1>
    <button className="primary-button" type="button" onClick={async () => setInvitation(await onCreateInvitation())}>Create invitation</button>
    {invitation ? <aside className="season-summary"><strong>{invitation}</strong><button type="button" onClick={() => setInvitation(undefined)}>Dismiss invitation</button></aside> : null}
    <ul>{leaders.map((leader) => <li key={leader.id}>{leader.name} · {leader.role} {leader.role === "leader" ? <button type="button" onClick={() => onPromote(leader.id)}>Promote to admin</button> : null}<button type="button" onClick={() => onRevoke(leader.id)}>Revoke access</button></li>)}</ul>
  </main>;
}
