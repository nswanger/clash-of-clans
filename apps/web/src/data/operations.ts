interface Result<T = unknown> { data?: T; error: { message: string } | null }

export type RecommendationRegenerationResult =
  | { status: "skipped"; reason: "no_active_cwl_context" }
  | { status: "persisted"; recommendationId: string; created: boolean };

export interface InvitationClient {
  rpc(name: string, args: Record<string, unknown>): Promise<Result<any>>;
}

export interface AccessPerson {
  id: string;
  name: string;
  role: "leader" | "admin";
  isCurrentUser: boolean;
}

export interface AccessInvitation {
  id: string;
  status: "pending" | "redeemed" | "expired" | "revoked";
  createdAt: string;
  expiresAt: string;
  createdByName: string;
  usedAt: string | null;
  usedByName: string | null;
  revokedAt: string | null;
  revokedByName: string | null;
  reissuedFromId: string | null;
  reissuedInvitationId: string | null;
}

export interface AccessAuditEvent {
  id: string;
  eventType: "invitation_created" | "invitation_redeemed" | "invitation_revoked" | "invitation_reissued" | "role_granted" | "role_revoked";
  actorName: string;
  targetName: string | null;
  eventData: Record<string, unknown>;
  occurredAt: string;
}

export interface AccessManagementSnapshot {
  people: AccessPerson[];
  invitations: AccessInvitation[];
  auditEvents: AccessAuditEvent[];
}

export type AccessManagementClient = InvitationClient;

export interface RecommendationFunctionClient {
  functions: {
    invoke(
      name: "regenerate-recommendations",
      options: { body: { clanTag: string } },
    ): Promise<Result<unknown>>;
  };
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

export async function loadAccessManagement(client: AccessManagementClient): Promise<AccessManagementSnapshot> {
  const result = await client.rpc("get_access_management_snapshot", { access_audit_limit: 50 });
  ensureSuccess(result, "Unable to load access management");
  if (!result.data) throw new Error("Access management returned no data.");
  return result.data;
}

export async function reissueInvitation(client: AccessManagementClient, invitationId: string, expiresAt: string): Promise<string> {
  const result = await client.rpc("reissue_invitation", { invitation_id: invitationId, invitation_expires_at: expiresAt });
  ensureSuccess(result, "Unable to reissue invitation");
  if (!result.data) throw new Error("Invitation reissue returned no token.");
  return result.data;
}

export async function revokeInvitation(client: AccessManagementClient, invitationId: string): Promise<void> {
  ensureSuccess(await client.rpc("revoke_invitation", { invitation_id: invitationId }), "Unable to revoke invitation");
}

export async function promoteLeader(client: AccessManagementClient, userId: string): Promise<void> {
  ensureSuccess(await client.rpc("promote_to_admin", { target_user_id: userId }), "Unable to promote leader");
}

export async function demoteAdmin(client: AccessManagementClient, userId: string): Promise<void> {
  ensureSuccess(await client.rpc("demote_to_leader", { target_user_id: userId }), "Unable to demote admin");
}

export async function revokeAccess(client: AccessManagementClient, userId: string): Promise<void> {
  ensureSuccess(await client.rpc("revoke_user_access", { target_user_id: userId }), "Unable to revoke access");
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

export async function regenerateRecommendations(
  client: RecommendationFunctionClient,
  clanTag: string,
): Promise<RecommendationRegenerationResult> {
  const result = await client.functions.invoke("regenerate-recommendations", {
    body: { clanTag },
  });
  ensureSuccess(result, "Unable to regenerate recommendations");
  if (!isRecommendationRegenerationResult(result.data)) {
    throw new Error("Recommendation regeneration returned an invalid response.");
  }
  return result.data;
}

function isRecommendationRegenerationResult(value: unknown): value is RecommendationRegenerationResult {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.status === "skipped") return candidate.reason === "no_active_cwl_context";
  return candidate.status === "persisted"
    && typeof candidate.recommendationId === "string"
    && typeof candidate.created === "boolean";
}
