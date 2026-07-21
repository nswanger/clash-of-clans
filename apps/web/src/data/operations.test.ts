import { describe, expect, it, vi } from "vitest";
import {
  approveRecommendation,
  createInvitation,
  demoteAdmin,
  loadAccessManagement,
  promoteLeader,
  regenerateRecommendations,
  reissueInvitation,
  revokeAccess,
  revokeInvitation,
  saveAvailability,
} from "./operations.js";

describe("Supabase operations", () => {
  it("upserts availability using the current leader identity", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const client = { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "leader-1" } }, error: null }) }, from: vi.fn().mockReturnValue({ upsert }) };
    await saveAvailability(client, { clanTag: "#CLAN", seasonId: "2026-07", playerTag: "#ONE", status: "available", note: "In" });
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ recorded_by: "leader-1", status: "available" }), { onConflict: "clan_tag,season_id,player_tag" });
  });

  it("creates invitations through the protected server function", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "one-time-token", error: null });
    await expect(createInvitation({ rpc }, "2026-07-14T00:00:00.000Z")).resolves.toBe("one-time-token");
    expect(rpc).toHaveBeenCalledWith("create_invitation", { invitation_expires_at: "2026-07-14T00:00:00.000Z" });
  });

  it("uses protected functions for role and invitation lifecycle mutations", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const client = { rpc };
    await promoteLeader(client, "leader-1");
    await demoteAdmin(client, "admin-2");
    await revokeAccess(client, "leader-1");
    await revokeInvitation(client, "invitation-1");
    expect(rpc).toHaveBeenCalledWith("promote_to_admin", { target_user_id: "leader-1" });
    expect(rpc).toHaveBeenCalledWith("demote_to_leader", { target_user_id: "admin-2" });
    expect(rpc).toHaveBeenCalledWith("revoke_user_access", { target_user_id: "leader-1" });
    expect(rpc).toHaveBeenCalledWith("revoke_invitation", { invitation_id: "invitation-1" });
  });

  it("loads the access snapshot and returns a one-time reissue token", async () => {
    const snapshot = { people: [], invitations: [], auditEvents: [] };
    const rpc = vi.fn().mockImplementation((name: string) => Promise.resolve({
      data: name === "get_access_management_snapshot" ? snapshot : "replacement-token",
      error: null,
    }));
    const client = { rpc };
    await expect(loadAccessManagement(client)).resolves.toEqual(snapshot);
    await expect(reissueInvitation(client, "invitation-1", "2026-07-21T00:00:00Z")).resolves.toBe("replacement-token");
    expect(rpc).toHaveBeenCalledWith("get_access_management_snapshot", { access_audit_limit: 50 });
    expect(rpc).toHaveBeenCalledWith("reissue_invitation", {
      invitation_id: "invitation-1",
      invitation_expires_at: "2026-07-21T00:00:00Z",
    });
  });

  it("appends an approval decision using the current leader identity", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const client = { rpc };
    await approveRecommendation(client, "recommendation-1", [{ outPlayerTag: "#OUT", inPlayerTag: "#IN" }]);
    expect(rpc).toHaveBeenCalledWith("record_leader_decision", expect.objectContaining({ recommendation_id: "recommendation-1", decision_status: "approved" }));
  });

  it("regenerates recommendations through the protected Edge Function", async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: { status: "persisted", recommendationId: "recommendation-2", created: true },
      error: null,
    });

    await expect(regenerateRecommendations({ functions: { invoke } }, "#CLAN")).resolves.toEqual({
      status: "persisted",
      recommendationId: "recommendation-2",
      created: true,
    });
    expect(invoke).toHaveBeenCalledWith("regenerate-recommendations", { body: { clanTag: "#CLAN" } });
  });
});
