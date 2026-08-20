/* The Admin route's loader (#25, wave 3).
 *
 * Two loads rather than one, and they fail independently on purpose: access
 * management is the page, and collection health is a section inside it. A
 * collection-health query that fails must not take the invitation controls down
 * with it — the operator who most needs to create an invitation is the one
 * whose collector is broken.
 */
import { useCallback, useEffect, useState } from "react";
import {
  createInvitation,
  demoteAdmin,
  loadAccessManagement,
  loadCollectionHealth,
  promoteLeader,
  reissueInvitation,
  revokeAccess,
  revokeInvitation,
  type AccessManagementClient,
  type AccessManagementSnapshot,
  type CollectionHealth,
} from "../data/operations.js";
import { AppTopbar } from "../app-chrome.js";
import { AdminPage } from "./admin-page.js";
import "./admin.css";

function expiresTomorrow(): string {
  return new Date(Date.now() + 86_400_000).toISOString();
}

function invitationUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, "")}/?invitation=${encodeURIComponent(token)}`;
}

export function AdminRoute({ client, origin }: { client: AccessManagementClient; origin: string }) {
  const [snapshot, setSnapshot] = useState<AccessManagementSnapshot>();
  const [collection, setCollection] = useState<CollectionHealth>();
  const [loadError, setLoadError] = useState<string>();

  const load = useCallback(async () => {
    try {
      setSnapshot(await loadAccessManagement(client));
      setLoadError(undefined);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to load access management.");
    }
    /* Swallowed rather than raised: an unavailable health section renders as
       absent, which is the honest reading of "we could not ask". Raising it
       would put a collector problem in the notice region of the page that
       manages people. */
    await loadCollectionHealth(client)
      .then(setCollection)
      .catch(() => setCollection(undefined));
  }, [client]);

  useEffect(() => { void load(); }, [load]);

  if (!snapshot && loadError) {
    return <main className="cm-shell admin-page">
      <AppTopbar route="admin" eyebrow="Operations" title="Admin" />
      <div className="cm-notice" role="alert">
        <div className="cm-grow"><strong>Admin unavailable</strong><p>{loadError}</p></div>
        <button type="button" onClick={() => void load()}>Retry</button>
      </div>
    </main>;
  }
  /* Nothing at all below the threshold, and no copy above it: this route is one
     RPC and it either arrives or reports itself (#43). */
  if (!snapshot) return <main className="cm-shell admin-page" aria-busy="true" />;

  const refreshAfter = async (mutation: () => Promise<void>) => {
    await mutation();
    await load();
  };

  return <AdminPage
    snapshot={snapshot}
    collection={collection}
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
