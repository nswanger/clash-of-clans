import { describe, expect, it, vi } from "vitest";
import { activityWindow, loadMemberRoster, type MemberRosterMember } from "./member-history.js";

describe("member history", () => {
  it("loads and maps the leader-readable roster overview", async () => {
    const eq = vi.fn().mockResolvedValue({ data: [databaseRow()], error: null });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });

    const members = await loadMemberRoster({ from }, "#CLAN");

    expect(from).toHaveBeenCalledWith("member_roster_overview");
    expect(eq).toHaveBeenCalledWith("clan_tag", "#CLAN");
    expect(members[0]).toEqual(expect.objectContaining({
      playerTag: "#ONE", name: "One", isCurrentMember: true,
      baseline7d: expect.objectContaining({ observedOn: "2026-07-01", attackWins: 10 }),
    }));
  });

  it("reports evidence and reset boundaries without calling a player inactive", () => {
    const member = mappedMember();
    const result = activityWindow(member, {
      observedOn: "2026-07-01", role: "member", townHallLevel: 17, trophies: 5000,
      leagueId: 1, donations: 100, donationsReceived: 80, warPreference: "out",
      attackWins: 10, defenseWins: 4, clanCapitalContributions: 2000, clanGamesPoints: 6000,
    });

    expect(result.status).toBe("observed");
    expect(result.evidence).toEqual(expect.arrayContaining([
      "+14 multiplayer attacks", "+225 troops donated", "+60 trophies", "role changed to Elder",
    ]));
    expect(result.resets).toEqual(["Clan Games progress reset"]);
  });

  it("uses an explicit unknown state until a baseline exists", () => {
    expect(activityWindow(mappedMember(), null)).toEqual({
      status: "unknown", baselineOn: null, evidence: [], resets: [],
    });
  });
});

export function databaseRow() {
  return {
    clan_tag: "#CLAN", player_tag: "#ONE", name: "One", role: "elder", clan_rank: 1,
    previous_clan_rank: 2, town_hall_level: 17, trophies: 5060, league_id: 1,
    league_name: "Legend League", donations: 325, donations_received: 95,
    war_preference: "in", war_stars: 100, attack_wins: 24, defense_wins: 4,
    clan_capital_contributions: 2500, clan_games_points: 500,
    roster_observed_at: "2026-07-08T12:00:00Z", profile_observed_at: "2026-07-08T12:00:30Z",
    first_observed_present_on: "2026-07-01", last_observed_present_on: "2026-07-08",
    is_current_member: true, departure_observed_on: null,
    current_presence_started_on: "2026-07-01",
    baseline_1d: null,
    baseline_7d: {
      observed_on: "2026-07-01", role: "member", town_hall_level: 17, trophies: 5000,
      league_id: 1, donations: 100, donations_received: 80, war_preference: "out",
      attack_wins: 10, defense_wins: 4, clan_capital_contributions: 2000, clan_games_points: 6000,
    },
    baseline_30d: null,
  };
}

function mappedMember(): MemberRosterMember {
  return {
    clanTag: "#CLAN", playerTag: "#ONE", name: "One", role: "elder", clanRank: 1,
    previousClanRank: 2, townHallLevel: 17, trophies: 5060, leagueId: 1,
    leagueName: "Legend League", donations: 325, donationsReceived: 95,
    warPreference: "in", warStars: 100, attackWins: 24, defenseWins: 4,
    clanCapitalContributions: 2500, clanGamesPoints: 500,
    rosterObservedAt: "2026-07-08T12:00:00Z", profileObservedAt: "2026-07-08T12:00:30Z",
    firstObservedPresentOn: "2026-07-01", lastObservedPresentOn: "2026-07-08",
    isCurrentMember: true, currentPresenceStartedOn: "2026-07-01", departureObservedOn: null,
    baseline1d: null, baseline7d: null, baseline30d: null,
  };
}
