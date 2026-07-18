import { describe, expect, it } from "vitest";
import { mapDashboardData, type DashboardSnapshot } from "./dashboard-model.js";

const snapshot: DashboardSnapshot = {
  clanName: "#CLAN",
  state: "ready",
  season: { clan_tag: "#CLAN", season_id: "2026-07", war_size: 15 },
  war: { war_tag: "#WAR3", war_day: 3, end_time: "2026-07-12T20:14:08.000Z", attacks_per_member: 1 },
  members: [
    { player_tag: "#OUT", name: "Mason", town_hall_level: 15 },
    { player_tag: "#IN", name: "Sam", town_hall_level: 16 },
    { player_tag: "#ASK", name: "Kira", town_hall_level: 14 },
  ],
  assignments: [{ player_tag: "#OUT", assigned_attacks: 1 }],
  attacks: [{ attacker_tag: "#OUT" }],
  availability: [
    { player_tag: "#OUT", status: "available" },
    { player_tag: "#IN", status: "available" },
    { player_tag: "#ASK", status: "unknown" },
  ],
  eligibility: [
    { player_tag: "#OUT", stars: 8, eight_star_eligible: true },
    { player_tag: "#IN", stars: 5, eight_star_eligible: false },
    { player_tag: "#ASK", stars: 2, eight_star_eligible: false },
  ],
  collection: { status: "healthy", last_fresh_at: "2026-07-12T17:56:00.000Z", error_message: null },
  recommendation: {
    changes: [{ outPlayerTag: "#OUT", inPlayerTag: "#IN", reasons: [{ code: "missed_attack", explanation: "Missed an assigned attack" }], confidenceNote: "Limited history" }],
    contacts: [{ playerTag: "#ASK", reason: "Availability is unknown" }],
    coverageGaps: [],
    confidenceNotes: [],
  },
};

describe("mapDashboardData", () => {
  it("maps live war, member, availability, eligibility, and recommendation rows", () => {
    const result = mapDashboardData(snapshot);

    expect(result).toMatchObject({
      warDay: 3,
      attacksUsed: 1,
      attacksAvailable: 1,
      availableMembers: 2,
      awaitingAvailability: 1,
      membersAtEightStars: 1,
      membersWithinThreeStars: 1,
    });
    expect(result.recommendations.remove[0]).toMatchObject({ name: "Mason", playerTag: "#OUT" });
    expect(result.recommendations.add[0]).toMatchObject({ name: "Sam", playerTag: "#IN" });
    expect(result.contacts).toEqual([{ playerTag: "#ASK", name: "Kira", reason: "Availability is unknown" }]);
    expect(result.season).toEqual({
      verificationStatus: "unavailable",
      message: "Verified CWL group standings are not available yet.",
    });
  });

  it("maps collection and coverage failures into visible warnings", () => {
    const result = mapDashboardData({
      ...snapshot,
      collection: { status: "invalid_ip", last_fresh_at: snapshot.collection.last_fresh_at, error_message: "Blocked IP" },
      recommendation: { ...snapshot.recommendation, coverageGaps: [{ position: 11, reason: "No eligible substitute" }] },
    });

    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "invalidIp" }),
      expect.objectContaining({ code: "coverage_gap", message: expect.stringContaining("position 11") }),
    ]));
  });

  it("maps a missing active war into an explicit operational state", () => {
    const result = mapDashboardData({
      ...snapshot,
      state: "no_active_war",
      war: null,
      assignments: [],
      attacks: [],
      recommendation: { changes: [], contacts: [], coverageGaps: [], confidenceNotes: [] },
    });

    expect(result).toMatchObject({
      state: "no_active_war",
      recommendations: { remove: [], add: [] },
    });
    expect(result).not.toHaveProperty("warDay");
    expect(result).not.toHaveProperty("warEndsAt");
  });

  it("maps the collected clan roster for an idle CWL overview", () => {
    const result = mapDashboardData({
      ...snapshot,
      state: "no_season",
      season: null,
      war: null,
      assignments: [],
      attacks: [],
      availability: [],
      eligibility: [],
      recommendation: { changes: [], contacts: [], coverageGaps: [], confidenceNotes: [] },
    });

    expect(result.clanMembers).toEqual([
      { playerTag: "#IN", name: "Sam", townHallLevel: 16 },
      { playerTag: "#OUT", name: "Mason", townHallLevel: 15 },
      { playerTag: "#ASK", name: "Kira", townHallLevel: 14 },
    ]);
    expect(result.updatedAt).toBe(snapshot.collection.last_fresh_at);
  });
});
