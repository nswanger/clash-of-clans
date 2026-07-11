import { describe, expect, it } from "vitest";
import { memberFactsSchema, recommendationContextSchema, type RecommendationContext } from "@cwl/domain";
import { OrderedRulesStrategy } from "./ordered-rules.js";

const member = (
  playerTag: string,
  overrides: Partial<Omit<RecommendationContext["members"][number], "playerTag" | "reliability">> = {},
) => memberFactsSchema.parse({
  playerTag,
  name: playerTag,
  townHallLevel: 16,
  availability: "available" as const,
  assignedOpportunities: 2,
  completedAssignedAttacks: 2,
  stars: 3,
  eightStarEligible: false,
  ...overrides,
});

const context = (overrides: Record<string, unknown> = {}): RecommendationContext =>
  recommendationContextSchema.parse({
    seasonTag: "2026-07",
    settings: {
      warSize: 15,
      targetCoreSize: 10,
      rotationPositions: 5,
      priorityMode: "balanced",
      eightStarRotationEnabled: true,
    },
    members: [
      member("#OUT", { completedAssignedAttacks: 1, eightStarEligible: true }),
      member("#A", { assignedOpportunities: 1, completedAssignedAttacks: 1 }),
      member("#B", { assignedOpportunities: 0, completedAssignedAttacks: 0 }),
    ],
    currentLineup: [{ playerTag: "#OUT", position: 11, isCore: false }],
    collectionHealth: { status: "healthy", collectedAt: "2026-07-11T12:00:00.000Z" },
    ...overrides,
  });

describe("OrderedRulesStrategy", () => {
  it("implements the stable strategy contract and reports a missed-attacker replacement", () => {
    const result = new OrderedRulesStrategy().recommend(context());
    expect(result.strategyVersion).toBe(new OrderedRulesStrategy().version);
    expect(result.changes[0]?.outPlayerTag).toBe("#OUT");
    expect(result.changes[0]?.reasons.map(({ code }) => code)).toContain("missed_attack");
  });

  it("excludes unavailable and unknown substitutes and puts unknown members on the contact list", () => {
    const result = new OrderedRulesStrategy().recommend(context({
      members: [
        member("#OUT", { availability: "unavailable" }),
        member("#NO", { availability: "unavailable" }),
        member("#ASK", { availability: "unknown" }),
      ],
    }));
    expect(result.changes).toEqual([]);
    expect(result.contacts.map(({ playerTag }) => playerTag)).toEqual(["#ASK"]);
    expect(result.coverageGaps).toEqual([{ position: 11, reason: expect.any(String) }]);
  });

  it("preserves the target core from reward rotation", () => {
    const result = new OrderedRulesStrategy().recommend(context({
      members: [member("#OUT", { eightStarEligible: true }), member("#A")],
      currentLineup: [{ playerTag: "#OUT", position: 1, isCore: true }],
    }));
    expect(result.changes).toEqual([]);
  });

  it("allows a required core replacement while explaining core preservation", () => {
    const result = new OrderedRulesStrategy().recommend(context({
      members: [member("#OUT", { availability: "unavailable" }), member("#A")],
      currentLineup: [{ playerTag: "#OUT", position: 1, isCore: true }],
    }));
    expect(result.changes[0]?.reasons.map(({ code }) => code)).toContain("preserve_core");
  });

  it("uses reliability, fewer opportunities, Town Hall fit, then player tag as stable tie-breaks", () => {
    const base = context({
      members: [
        member("#OUT", { availability: "unavailable", townHallLevel: 15 }),
        member("#LOW", { assignedOpportunities: 2, completedAssignedAttacks: 1 }),
        member("#MORE", { assignedOpportunities: 3, completedAssignedAttacks: 3 }),
        member("#FAR", { assignedOpportunities: 1, completedAssignedAttacks: 1, townHallLevel: 13 }),
        member("#Z", { assignedOpportunities: 1, completedAssignedAttacks: 1, townHallLevel: 15 }),
        member("#A", { assignedOpportunities: 1, completedAssignedAttacks: 1, townHallLevel: 15 }),
      ],
    });
    const result = new OrderedRulesStrategy().recommend(base);
    expect(result.changes[0]?.inPlayerTag).toBe("#A");
    expect(result.changes[0]?.reasons.map(({ code }) => code)).toEqual(expect.arrayContaining([
      "current_cwl_reliability", "opportunity_count", "town_hall_fit", "player_tag_fallback",
    ]));
    expect(new OrderedRulesStrategy().recommend(base)).toEqual(result);
  });

  it("marks zero-opportunity substitutes as limited confidence", () => {
    const result = new OrderedRulesStrategy().recommend(context({
      members: [
        member("#OUT", { availability: "unavailable" }),
        member("#NEW", { assignedOpportunities: 0, completedAssignedAttacks: 0 }),
      ],
    }));
    expect(result.changes[0]?.confidenceNote).toMatch(/limited/i);
    expect(result.confidenceNotes).toContainEqual(expect.stringMatching(/#NEW/));
    expect(result.changes[0]?.reasons.map(({ code }) => code)).toContain("limited_confidence");
  });
});
