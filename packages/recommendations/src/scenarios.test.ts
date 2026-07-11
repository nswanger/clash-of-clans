import { describe, expect, it } from "vitest";
import { recommendationContextSchema } from "@cwl/domain";
import { OrderedRulesStrategy } from "./ordered-rules.js";

const scenario = (priorityMode: "balanced" | "standings_first") => recommendationContextSchema.parse({
  seasonTag: "2026-07",
  settings: { warSize: 15, priorityMode, eightStarRotationEnabled: true },
  members: [
    { playerTag: "#CORE", name: "Core", townHallLevel: 16, availability: "available", assignedOpportunities: 3, completedAssignedAttacks: 3, stars: 8, eightStarEligible: true },
    { playerTag: "#ROTATE", name: "Rotate", townHallLevel: 15, availability: "available", assignedOpportunities: 3, completedAssignedAttacks: 3, stars: 8, eightStarEligible: true },
    { playerTag: "#BENCH", name: "Bench", townHallLevel: 15, availability: "available", assignedOpportunities: 1, completedAssignedAttacks: 1, stars: 3, eightStarEligible: false },
  ],
  currentLineup: [
    { playerTag: "#CORE", position: 1, isCore: true },
    { playerTag: "#ROTATE", position: 11, isCore: false },
  ],
  collectionHealth: { status: "healthy", collectedAt: "2026-07-11T12:00:00.000Z" },
});

describe("priority-mode scenarios", () => {
  it("Balanced rotates an eight-star eligible rotation member while preserving core", () => {
    const result = new OrderedRulesStrategy().recommend(scenario("balanced"));
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]).toMatchObject({ outPlayerTag: "#ROTATE", inPlayerTag: "#BENCH" });
    expect(result.changes[0]?.reasons.map(({ code }) => code)).toContain("eight_star_rotation");
  });

  it("Standings-first does not make a reward-only rotation", () => {
    expect(new OrderedRulesStrategy().recommend(scenario("standings_first")).changes).toEqual([]);
  });
});
