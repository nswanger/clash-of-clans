import { describe, expect, it, vi } from "vitest";
import {
  activityStatus,
  loadMemberRoster,
  loadWarActivityWindow,
  type MemberWarActivity,
} from "./member-history.js";

describe("member history", () => {
  it("loads and maps the leader-readable roster overview", async () => {
    const eq = vi.fn().mockResolvedValue({ data: [databaseRow()], error: null });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });

    const members = await loadMemberRoster({ from }, "#CLAN");

    expect(from).toHaveBeenCalledWith("member_roster_overview");
    expect(eq).toHaveBeenCalledWith("clan_tag", "#CLAN");
    expect(members[0]).toEqual(expect.objectContaining({
      playerTag: "#ONE", name: "One", isCurrentMember: true, leagueName: "Legend League",
    }));
  });

  it("names its columns rather than selecting the counters it stopped reading", async () => {
    const select = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) });
    await loadMemberRoster({ from: vi.fn().mockReturnValue({ select }) }, "#CLAN");

    const columns = String(select.mock.calls[0]?.[0]);
    expect(columns).toContain("current_presence_started_on");
    for (const dropped of ["*", "baseline_", "previous_clan_rank", "war_stars", "last_observed_present_on"]) {
      expect(columns).not.toContain(dropped);
    }
  });

  it("keeps partial roster rows usable for member pages", async () => {
    const eq = vi.fn().mockResolvedValue({
      data: [{ clan_tag: "#CLAN", player_tag: "#PARTIAL", role: "member", is_current_member: true }],
      error: null,
    });
    const members = await loadMemberRoster({ from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ eq }) }) }, "#CLAN");

    expect(members[0]).toEqual(expect.objectContaining({ playerTag: "#PARTIAL", name: "#PARTIAL" }));
  });

  it("reads observed war activity for the requested window, keyed by player", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [activityRow()], error: null });

    const activity = await loadWarActivityWindow({ rpc }, "#CLAN", 7);

    expect(rpc).toHaveBeenCalledWith("regular_war_member_activity_window", {
      requested_clan_tag: "#CLAN", requested_window_days: 7,
    });
    expect(activity.get("#ONE")).toEqual(expect.objectContaining({
      warsObserved: 3, warsParticipated: 2, attacksMade: 3, stars: 7,
    }));
  });

  it("reports no logged war as unknown rather than as absence", () => {
    expect(activityStatus(undefined)).toBe("unknown");
    expect(activityStatus(activity({ warsObserved: 0 }))).toBe("unknown");
  });

  it("separates an observed attack from a window that logged wars without one", () => {
    expect(activityStatus(activity({ attacksMade: 3 }))).toBe("observed");
    expect(activityStatus(activity({ warsParticipated: 1, assignedAttacks: 2, attacksMade: 0 }))).toBe("none");
  });
});

function databaseRow() {
  return {
    clan_tag: "#CLAN", player_tag: "#ONE", name: "One", role: "elder", clan_rank: 1,
    town_hall_level: 17, league_name: "Legend League",
    donations: 325, donations_received: 95, war_preference: "in",
    roster_observed_at: "2026-07-08T12:00:00Z", profile_observed_at: "2026-07-08T12:00:30Z",
    first_observed_present_on: "2026-07-01", is_current_member: true,
    current_presence_started_on: "2026-07-01", departure_observed_on: null,
  };
}

function activityRow(overrides: Record<string, unknown> = {}) {
  return {
    clan_tag: "#CLAN", player_tag: "#ONE", window_days: 7,
    window_started_at: "2026-07-01T12:00:00Z", wars_observed: 3, wars_participated: 2,
    assigned_attacks: 4, attacks_made: 3, stars: 7, last_observed_at: "2026-07-07T12:00:00Z",
    activity_score: 75, performance_score: 78, stars_per_attack: 2.33, incomplete_wars: 0,
    ...overrides,
  };
}

function activity(overrides: Partial<MemberWarActivity>): MemberWarActivity {
  return {
    playerTag: "#ONE", windowDays: 7, warsObserved: 3, warsParticipated: 0,
    assignedAttacks: 0, attacksMade: 0, stars: 0, incompleteWars: 0,
    ...overrides,
  };
}
