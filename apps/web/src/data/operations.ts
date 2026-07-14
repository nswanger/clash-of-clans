interface Result<T = unknown> { data?: T; error: { message: string } | null }

export interface InvitationClient {
  rpc(name: "create_invitation", args: { invitation_expires_at: string }): Promise<Result<string>>;
}

export interface RoleMutationBuilder {
  insert(value: { user_id: string; role: "admin" }): Promise<Result>;
  delete(): { eq(column: "user_id", value: string): Promise<Result> };
}

export interface RoleMutationClient {
  from(table: "user_roles"): RoleMutationBuilder;
}

function ensureSuccess(result: Result, context: string): void {
  if (result.error) throw new Error(`${context}: ${result.error.message}`);
}

async function currentUserId(client: any): Promise<string> {
  const result = await client.auth.getUser();
  ensureSuccess(result, "Unable to identify the current leader");
  if (!result.data.user) throw new Error("Authentication required.");
  return result.data.user.id;
}

export async function saveAvailability(client: any, value: {
  clanTag: string; seasonId: string; playerTag: string; status: "available" | "unavailable" | "unknown"; note: string;
}): Promise<void> {
  const userId = await currentUserId(client);
  const result = await client.from("member_availability").upsert({
    clan_tag: value.clanTag,
    season_id: value.seasonId,
    player_tag: value.playerTag,
    status: value.status,
    note: value.note || null,
    recorded_by: userId,
    recorded_at: new Date().toISOString(),
  }, { onConflict: "clan_tag,season_id,player_tag" });
  ensureSuccess(result, "Unable to save availability");
}

export async function createInvitation(client: InvitationClient, expiresAt: string): Promise<string> {
  const result = await client.rpc("create_invitation", { invitation_expires_at: expiresAt });
  ensureSuccess(result, "Unable to create invitation");
  if (!result.data) throw new Error("Invitation creation returned no token.");
  return result.data;
}

export async function promoteLeader(client: RoleMutationClient, userId: string): Promise<void> {
  ensureSuccess(await client.from("user_roles").insert({ user_id: userId, role: "admin" }), "Unable to promote leader");
}

export async function revokeAccess(client: RoleMutationClient, userId: string): Promise<void> {
  ensureSuccess(await client.from("user_roles").delete().eq("user_id", userId), "Unable to revoke access");
}

export async function approveRecommendation(client: any, recommendationId: string, finalChanges: unknown[]): Promise<void> {
  ensureSuccess(await client.rpc("record_leader_decision", {
    recommendation_id: recommendationId,
    decision_status: "approved",
    final_changes: finalChanges,
    decision_override_note: null,
  }), "Unable to approve recommendation");
}

export async function overrideRecommendation(client: any, recommendationId: string, finalChanges: unknown[], overrideNote: string): Promise<void> {
  ensureSuccess(await client.rpc("record_leader_decision", {
    recommendation_id: recommendationId,
    decision_status: "overridden",
    final_changes: finalChanges,
    decision_override_note: overrideNote,
  }), "Unable to override recommendation");
}
