import { describe, expect, it, vi } from "vitest";
import {
  createInvitation,
  isCollectionUnhealthy,
  isExpectedIdleCwlPartial,
  demoteAdmin,
  loadAccessManagement,
  loadCurrentCwlLineupWorkspace,
  promoteLeader,
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

  it("rejects a bonus administration response with no season identity", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { bonusesAdministeredAt: null }, error: null });
    await expect(setCwlBonusesAdministered({ rpc }, { clanTag: "#CLAN", seasonId: "2026-08", administered: true }))
      .rejects.toThrow("Bonus administration returned an invalid response.");
  });

  it("surfaces a failed bonus administration rather than reporting success", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: { message: "Leader access required" } });
    await expect(setCwlBonusesAdministered({ rpc }, { clanTag: "#CLAN", seasonId: "2026-08", administered: true }))
      .rejects.toThrow("Unable to record whether the bonuses were handed out: Leader access required");
  });

  /* ---------------------------------------------------------------------
   * The idle-CWL exception
   * ------------------------------------------------------------------- */

  const attempt = (
    endpoint: string,
    status: string,
    httpStatus: number | null = 200,
    errorCategory: string | null = null,
  ) => ({ endpoint, status, httpStatus, errorCategory, startedAt: "2026-08-22T16:48:00Z", finishedAt: "2026-08-22T16:48:30Z" });

  const idleCwlRun = {
    status: "partial",
    attempts: [
      attempt("clan", "healthy"),
      attempt("members", "healthy"),
      attempt("player", "healthy"),
      attempt("league_group", "failed", 404, "not_found"),
    ],
  };

  it("reads a partial run whose only failure is the absent league group as healthy", () => {
    expect(isExpectedIdleCwlPartial(idleCwlRun)).toBe(true);
    expect(isCollectionUnhealthy(idleCwlRun)).toBe(false);
  });

  it("still reports a partial run that failed a second endpoint", () => {
    const alsoBrokenMembers = {
      status: "partial",
      attempts: [...idleCwlRun.attempts, attempt("members", "failed", 200, "normalization_error")],
    };
    expect(isExpectedIdleCwlPartial(alsoBrokenMembers)).toBe(false);
    expect(isCollectionUnhealthy(alsoBrokenMembers)).toBe(true);
  });

  /* The exception is the league group being ABSENT, not the league group
     failing. A 500 there is an outage and has to keep reading as one. */
  it("still reports a league group that failed for any reason but a 404", () => {
    const leagueGroupOutage = {
      status: "partial",
      attempts: [attempt("clan", "healthy"), attempt("members", "healthy"), attempt("league_group", "failed", 500, "server_error")],
    };
    expect(isExpectedIdleCwlPartial(leagueGroupOutage)).toBe(false);
    expect(isCollectionUnhealthy(leagueGroupOutage)).toBe(true);
  });

  it("still reports a partial run whose clan or member attempts did not succeed", () => {
    const clanNeverRead = {
      status: "partial",
      attempts: [attempt("members", "healthy"), attempt("league_group", "failed", 404, "not_found")],
    };
    expect(isExpectedIdleCwlPartial(clanNeverRead)).toBe(false);
    expect(isCollectionUnhealthy(clanNeverRead)).toBe(true);
  });

  /* A caller that cannot see the attempts gets the status-only judgement, so
     the absence of evidence never clears a fault. */
  it("reports a partial run when no attempts were loaded to excuse it", () => {
    expect(isCollectionUnhealthy({ status: "partial" })).toBe(true);
    expect(isCollectionUnhealthy({ status: "partial", attempts: [] })).toBe(true);
  });

  it("leaves the healthy, running and unreadable statuses as they were", () => {
    expect(isCollectionUnhealthy({ status: "healthy", attempts: [] })).toBe(false);
    expect(isCollectionUnhealthy({ status: "running", attempts: [] })).toBe(false);
    expect(isCollectionUnhealthy({ status: null, attempts: [] })).toBe(true);
    expect(isCollectionUnhealthy({ status: "failed", attempts: idleCwlRun.attempts })).toBe(true);
  });
});
