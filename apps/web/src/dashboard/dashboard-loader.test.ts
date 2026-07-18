import { describe, expect, it } from "vitest";
import { loadDashboardSnapshot, type DashboardDataClient } from "./dashboard-loader.js";

const rows: Record<string, unknown> = {
  raw_snapshots: { response_body: { name: "Line Em Up" } },
  cwl_seasons: { clan_tag: "#CLAN", season_id: "2026-07", war_size: 15 },
  cwl_wars: { war_tag: "#WAR", war_day: 2, end_time: "2026-07-12T20:00:00.000Z", attacks_per_member: 1 },
  cwl_members: [{ player_tag: "#ONE", name: "One", town_hall_level: 16 }],
  cwl_war_members: [{ player_tag: "#ONE", assigned_attacks: 1 }],
  cwl_attacks: [{ attacker_tag: "#ONE" }],
  member_availability: [{ player_tag: "#ONE", status: "available" }],
  cwl_eight_star_eligibility: [{ player_tag: "#ONE", stars: 8, eight_star_eligible: true }],
  collection_attempts: { run_id: "run-1" },
  collection_runs: { status: "healthy", last_fresh_at: "2026-07-12T17:56:00.000Z", error_message: null },
  recommendations: { output: { changes: [], contacts: [], coverageGaps: [], confidenceNotes: [] } },
};

function queryResult(data: unknown) {
  const result = { data, error: null };
  const builder: Record<string, unknown> = { then: (resolve: (value: unknown) => void) => resolve(result) };
  for (const method of ["select", "eq", "in", "order", "limit"]) builder[method] = () => builder;
  builder.single = () => Promise.resolve(result);
  builder.maybeSingle = () => Promise.resolve(result);
  return builder;
}

describe("loadDashboardSnapshot", () => {
  it("loads the current season, war, metrics, health, and latest recommendation", async () => {
    const requestedTables: string[] = [];
    const client = {
      from(table: string) {
        requestedTables.push(table);
        return queryResult(rows[table]);
      },
    } as unknown as DashboardDataClient;

    const snapshot = await loadDashboardSnapshot(client, "#CLAN");

    expect(snapshot.clanName).toBe("Line Em Up");
    expect(snapshot.war?.war_tag).toBe("#WAR");
    expect(snapshot.recommendation.changes).toEqual([]);
    expect(requestedTables).toEqual(expect.arrayContaining([
      "cwl_seasons", "raw_snapshots", "cwl_wars", "cwl_members", "cwl_war_members", "cwl_attacks",
      "member_availability", "cwl_eight_star_eligibility", "collection_attempts", "collection_runs", "recommendations",
    ]));
  });

  it("returns an explicit empty-season snapshot without treating it as an exception", async () => {
    const client = { from: () => queryResult(null) } as unknown as DashboardDataClient;

    await expect(loadDashboardSnapshot(client, "#CLAN")).resolves.toMatchObject({
      state: "no_season",
      season: null,
      war: null,
      members: [],
      recommendation: { changes: [] },
    });
  });

  it("uses the collected clan name even when CWL is inactive", async () => {
    const client = {
      from(table: string) {
        return queryResult(table === "raw_snapshots" ? rows.raw_snapshots : null);
      },
    } as unknown as DashboardDataClient;

    await expect(loadDashboardSnapshot(client, "#CLAN")).resolves.toMatchObject({
      clanName: "Line Em Up",
      state: "no_season",
    });
  });

  it("returns an explicit no-active-war snapshot without treating it as an exception", async () => {
    const client = {
      from(table: string) {
        return queryResult(table === "cwl_seasons" ? rows.cwl_seasons : null);
      },
    } as unknown as DashboardDataClient;

    await expect(loadDashboardSnapshot(client, "#CLAN")).resolves.toMatchObject({
      state: "no_active_war",
      season: rows.cwl_seasons,
      war: null,
      recommendation: { changes: [] },
    });
  });
});
