import { describe, expect, it, vi } from "vitest";
import {
  approveRecommendation,
  createInvitation,
  demoteAdmin,
  loadAccessManagement,
  loadCurrentCwlLineupWorkspace,
  promoteLeader,
  regenerateRecommendations,
  normalizeClanRole,
  reinheritCwlLineupPlan,
  reissueInvitation,
  revokeAccess,
  revokeInvitation,
  saveCwlLineupPlan,
  saveAvailability,
  setCwlBonusesAdministered,
  setCwlLineupPlanLock,
} from "./operations.js";

describe("Supabase operations", () => {
  it("normalizes the Clash admin wire role to the product Elder role", () => {
    expect(normalizeClanRole("admin")).toBe("elder");
    expect(normalizeClanRole("leader")).toBe("leader");
    expect(normalizeClanRole("coLeader")).toBe("coLeader");
    expect(normalizeClanRole("elder")).toBe("unknown");
    expect(normalizeClanRole(undefined)).toBe("unknown");
  });

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

  it("saves lineup plans with the loaded revision and ordered player tags", async () => {
    const plan = {
      clanTag: "#CLAN", seasonId: "2026-08", warDay: 2, revision: 4, isLocked: false,
      lockedAt: null, lockedBy: null, inheritedFromWarDay: 1,
      createdAt: "2026-08-01T00:00:00Z", createdBy: "leader-1", updatedAt: "2026-08-01T00:01:00Z", updatedBy: "leader-1",
      playerTags: ["#ONE", "#TWO"],
    };
    const rpc = vi.fn().mockResolvedValue({ data: plan, error: null });
    await expect(saveCwlLineupPlan({ rpc }, { clanTag: "#CLAN", seasonId: "2026-08", warDay: 2, expectedRevision: 3, playerTags: ["#ONE", "#TWO"] })).resolves.toEqual(plan);
    expect(rpc).toHaveBeenCalledWith("save_cwl_daily_lineup_plan", {
      requested_clan_tag: "#CLAN",
      requested_season_id: "2026-08",
      requested_war_day: 2,
      expected_revision: 3,
      requested_player_tags: ["#ONE", "#TWO"],
    });
  });

  it("uses revision checks for lock and explicit re-inheritance mutations", async () => {
    const plan = {
      clanTag: "#CLAN", seasonId: "2026-08", warDay: 2, revision: 5, isLocked: true,
      lockedAt: "2026-08-01T00:02:00Z", lockedBy: "leader-1", inheritedFromWarDay: 1,
      createdAt: "2026-08-01T00:00:00Z", createdBy: "leader-1", updatedAt: "2026-08-01T00:02:00Z", updatedBy: "leader-1",
      playerTags: ["#ONE"],
    };
    const rpc = vi.fn().mockResolvedValue({ data: plan, error: null });
    const client = { rpc };
    await expect(setCwlLineupPlanLock(client, { clanTag: "#CLAN", seasonId: "2026-08", warDay: 2, expectedRevision: 4, isLocked: true })).resolves.toEqual(plan);
    await expect(reinheritCwlLineupPlan(client, { clanTag: "#CLAN", seasonId: "2026-08", warDay: 2, expectedRevision: 4 })).resolves.toEqual(plan);
    expect(rpc).toHaveBeenNthCalledWith(1, "set_cwl_daily_lineup_plan_lock", expect.objectContaining({ expected_revision: 4, requested_is_locked: true }));
    expect(rpc).toHaveBeenNthCalledWith(2, "reinherit_cwl_daily_lineup_plan", expect.objectContaining({ expected_revision: 4 }));
  });

  it("selects the latest active CWL day instead of a later completed day", async () => {
    const plan = {
      clanTag: "#CLAN", seasonId: "2026-08", warDay: 2, revision: 1, isLocked: false,
      lockedAt: null, lockedBy: null, inheritedFromWarDay: 1,
      createdAt: "2026-08-02T00:00:00Z", createdBy: "leader-1", updatedAt: "2026-08-02T00:00:00Z", updatedBy: "leader-1",
      playerTags: [],
    };
    const wars = [
      { clan_tag: "#CLAN", season_id: "2026-08", war_tag: "#WAR1", war_day: 1, state: "inWar", updated_at: "2026-08-01T12:00:00Z" },
      { clan_tag: "#CLAN", season_id: "2026-08", war_tag: "#WAR2", war_day: 2, state: "preparation", updated_at: "2026-08-02T00:00:00Z" },
      { clan_tag: "#CLAN", season_id: "2026-08", war_tag: "#WAR3", war_day: 3, state: "warEnded", updated_at: "2026-08-03T00:00:00Z" },
    ];
    const tableRows: Record<string, unknown[]> = {
      cwl_seasons: [{ clan_tag: "#CLAN", season_id: "2026-08", war_size: 15 }],
      cwl_wars: wars,
      cwl_members: [{ clan_tag: "#CLAN", season_id: "2026-08", player_tag: "#MASON", name: "Mason", town_hall_level: 15 }],
      member_availability: [],
      member_roster_overview: [],
      cwl_current_reliability: [],
      cwl_member_stars: [],
      cwl_war_members: [{ war_tag: "#WAR1", player_tag: "#MASON", map_position: 1, assigned_attacks: 1 }],
      cwl_attacks: [{ war_tag: "#WAR1", attacker_tag: "#MASON", stars: 3 }],
      recommendations: [],
      audit_events: [],
      collection_runs: [],
    };

    const client = {
      from(table: string) {
        let resultRows = [...(tableRows[table] ?? [])] as Array<Record<string, unknown>>;
        const query = {
          select: () => query,
          eq: (column: string, value: unknown) => {
            resultRows = resultRows.filter((row) => row[column] === value);
            return query;
          },
          in: (column: string, values: unknown[]) => {
            resultRows = resultRows.filter((row) => values.includes(row[column]));
            return query;
          },
          order: (column: string, options?: { ascending?: boolean }) => {
            resultRows.sort((left, right) => {
              const comparison = String(left[column] ?? "").localeCompare(String(right[column] ?? ""), undefined, { numeric: true });
              return options?.ascending === false ? -comparison : comparison;
            });
            return query;
          },
          limit: (count: number) => {
            resultRows = resultRows.slice(0, count);
            return query;
          },
          maybeSingle: async () => ({ data: resultRows[0] ?? null, error: null }),
          single: async () => ({ data: resultRows[0] ?? null, error: null }),
          then: (resolve: (value: { data: unknown[]; error: null }) => unknown) => resolve({ data: resultRows, error: null }),
        };
        return query;
      },
      rpc: vi.fn().mockResolvedValue({ data: plan, error: null }),
    };

    const snapshot = await loadCurrentCwlLineupWorkspace(client, "#CLAN");

    expect(snapshot.plan.warDay).toBe(2);
    expect(snapshot.members[0]).toMatchObject({ currentWarAssignedAttacks: 1, currentWarAttacksMade: 1, attackEvidenceWarDay: 1 });
    expect(client.rpc).toHaveBeenCalledWith("ensure_cwl_daily_lineup_plan", expect.objectContaining({ requested_war_day: 2 }));
  });
  it("records whether the CWL bonuses were handed out, and carries null through as not yet", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { clanTag: "#CLAN", seasonId: "2026-08", bonusesAdministeredAt: null },
      error: null,
    });
    await expect(setCwlBonusesAdministered({ rpc }, { clanTag: "#CLAN", seasonId: "2026-08", administered: false }))
      .resolves.toEqual({ clanTag: "#CLAN", seasonId: "2026-08", bonusesAdministeredAt: null });
    expect(rpc).toHaveBeenCalledWith("set_cwl_bonuses_administered", {
      requested_clan_tag: "#CLAN",
      requested_season_id: "2026-08",
      administered: false,
    });
  });

  it("returns the instant the bonuses were handed out when the season is marked", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { clanTag: "#CLAN", seasonId: "2026-08", bonusesAdministeredAt: "2026-08-20T12:00:00.000Z" },
      error: null,
    });
    const result = await setCwlBonusesAdministered({ rpc }, { clanTag: "#CLAN", seasonId: "2026-08", administered: true });
    expect(result.bonusesAdministeredAt).toBe("2026-08-20T12:00:00.000Z");
  });

  it("surfaces a failed bonus administration rather than reporting success", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: { message: "Leader access required" } });
    await expect(setCwlBonusesAdministered({ rpc }, { clanTag: "#CLAN", seasonId: "2026-08", administered: true }))
      .rejects.toThrow("Unable to record whether the bonuses were handed out: Leader access required");
  });
});
