import { useEffect, useState } from "react";
import { createInvitation, promoteLeader, revokeAccess } from "../data/operations.js";
import { AccessManagement } from "./access-management.js";

interface Leader { id: string; name: string; role: "leader" | "admin" }

export function AccessPage({ client, origin }: { client: any; origin: string }) {
  const [leaders, setLeaders] = useState<Leader[]>();
  const [error, setError] = useState<string>();
  const load = async () => {
    const result = await client.from("user_roles").select("user_id,role,profiles!user_roles_user_id_fkey(display_name)").order("created_at");
    if (result.error) throw new Error(result.error.message);
    const leadersById = new Map<string, Leader>();
    for (const row of result.data as any[]) {
      const existing = leadersById.get(row.user_id);
      if (!existing || row.role === "admin") leadersById.set(row.user_id, { id: row.user_id, role: row.role, name: row.profiles?.display_name ?? row.user_id });
    }
    setLeaders([...leadersById.values()]);
  };
  useEffect(() => { void load().catch((reason) => setError(reason.message)); }, [client]);
  if (error) return <main className="dashboard-shell"><div role="alert">{error}</div></main>;
  if (!leaders) return <main className="dashboard-shell"><p role="status">Loading access…</p></main>;
  return <AccessManagement
    leaders={leaders}
    onCreateInvitation={async () => `${origin.replace(/\/$/, "")}/?invitation=${encodeURIComponent(await createInvitation(client, new Date(Date.now() + 86_400_000).toISOString()))}`}
    onPromote={(id) => void promoteLeader(client, id).then(load).catch((reason) => setError(reason.message))}
    onRevoke={(id) => void revokeAccess(client, id).then(load).catch((reason) => setError(reason.message))}
  />;
}
