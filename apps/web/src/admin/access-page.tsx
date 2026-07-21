import { useCallback, useEffect, useState } from "react";
import {
  createInvitation,
  demoteAdmin,
  loadAccessManagement,
  promoteLeader,
  reissueInvitation,
  revokeAccess,
  revokeInvitation,
  type AccessManagementClient,
  type AccessManagementSnapshot,
} from "../data/operations.js";
import { AccessManagement } from "./access-management.js";

function expiresTomorrow(): string {
  return new Date(Date.now() + 86_400_000).toISOString();
}

function invitationUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, "")}/?invitation=${encodeURIComponent(token)}`;
}

export function AccessPage({ client, origin }: { client: AccessManagementClient; origin: string }) {
  const [snapshot, setSnapshot] = useState<AccessManagementSnapshot>();
  const [loadError, setLoadError] = useState<string>();

  const load = useCallback(async () => {
    try {
      setSnapshot(await loadAccessManagement(client));
      setLoadError(undefined);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to load access management.");
    }
  }, [client]);

  useEffect(() => { void load(); }, [load]);

  if (!snapshot && loadError) {
    return <main className="dashboard-shell access-management">
      <h1>Access management</h1>
      <p className="dashboard-warning" role="alert">{loadError}</p>
      <button type="button" onClick={() => void load()}>Retry</button>
    </main>;
  }
  if (!snapshot) return <main className="dashboard-shell"><p role="status">Loading access…</p></main>;

  const refreshAfter = async (mutation: () => Promise<void>) => {
    await mutation();
    await load();
  };

  return <AccessManagement
    snapshot={snapshot}
    loadError={loadError}
    onRetryLoad={load}
    onCreateInvitation={async () => {
      const token = await createInvitation(client, expiresTomorrow());
      await load();
      return invitationUrl(origin, token);
    }}
    onReissueInvitation={async (id) => {
      const token = await reissueInvitation(client, id, expiresTomorrow());
      await load();
      return invitationUrl(origin, token);
    }}
    onRevokeInvitation={(id) => refreshAfter(() => revokeInvitation(client, id))}
    onPromote={(id) => refreshAfter(() => promoteLeader(client, id))}
    onDemote={(id) => refreshAfter(() => demoteAdmin(client, id))}
    onRevokeAccess={(id) => refreshAfter(() => revokeAccess(client, id))}
    onCopyInvitation={(value) => navigator.clipboard.writeText(value)}
    confirmAction={(message) => window.confirm(message)}
  />;
}
