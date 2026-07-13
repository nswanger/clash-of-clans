import { describe, expect, it, vi } from "vitest";
import { approveRecommendation, createInvitation, promoteLeader, revokeAccess, saveAvailability } from "./operations.js";

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

  it("promotes and revokes leaders through role mutations", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const deleteEq = vi.fn().mockResolvedValue({ error: null });
    const client = { from: vi.fn().mockReturnValue({ insert, delete: vi.fn().mockReturnValue({ eq: deleteEq }) }) };
    await promoteLeader(client, "leader-1");
    await revokeAccess(client, "leader-1");
    expect(insert).toHaveBeenCalledWith({ user_id: "leader-1", role: "admin" });
    expect(deleteEq).toHaveBeenCalledWith("user_id", "leader-1");
  });

  it("appends an approval decision using the current leader identity", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const client = { rpc };
    await approveRecommendation(client, "recommendation-1", [{ outPlayerTag: "#OUT", inPlayerTag: "#IN" }]);
    expect(rpc).toHaveBeenCalledWith("record_leader_decision", expect.objectContaining({ recommendation_id: "recommendation-1", decision_status: "approved" }));
  });
});
