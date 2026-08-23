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
    expect(result.exclusions).toEqual([
      { playerTag: "#ASK", name: "#ASK", reasonCode: "availability_unknown" },
      { playerTag: "#NO", name: "#NO", reasonCode: "unavailable" },
      { playerTag: "#OUT", name: "#OUT", reasonCode: "unavailable" },
    ]);
    expect(result.coverageGaps).toEqual([{ position: 11, reason: expect.any(String) }]);
  });

  it("preserves the target core from reward rotation", () => {
    const result = new OrderedRulesStrategy().recommend(context({
      members: [member("#OUT", { eightStarEligible: true }), member("#A")],
      currentLineup: [{ playerTag: "#OUT", position: 1, isCore: true }],
    }));
    expect(result.changes).toEqual([]);
  });

  it("labels a required core replacement as an exception rather than preservation", () => {
    const result = new OrderedRulesStrategy().recommend(context({
      members: [member("#OUT", { availability: "unavailable" }), member("#A")],
      currentLineup: [{ playerTag: "#OUT", position: 1, isCore: true }],
    }));
    const codes = result.changes[0]?.reasons.map(({ code }) => code);
    expect(codes).toContain("forced_core_replacement");
    expect(codes).not.toContain("preserve_core");
  });

  it("stops after reliability when reliability alone decides the substitute", () => {
    const result = new OrderedRulesStrategy().recommend(context({
      members: [
        member("#OUT", { availability: "unavailable" }),
        member("#PERFECT", { assignedOpportunities: 2, completedAssignedAttacks: 2 }),
        member("#MISS", { assignedOpportunities: 2, completedAssignedAttacks: 1 }),
      ],
    }));
    expect(result.changes[0]?.reasons.map(({ code }) => code)).toEqual([
      "unavailable", "current_cwl_reliability",
    ]);
  });

  it("reports opportunity count but not later rules when opportunity count decides", () => {
    const result = new OrderedRulesStrategy().recommend(context({
      members: [
        member("#OUT", { availability: "unavailable" }),
        member("#FEWER", { assignedOpportunities: 1, completedAssignedAttacks: 1 }),
        member("#MORE", { assignedOpportunities: 3, completedAssignedAttacks: 3 }),
      ],
    }));
    expect(result.changes[0]?.reasons.map(({ code }) => code)).toEqual([
      "unavailable", "current_cwl_reliability", "opportunity_count",
    ]);
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

  it("uses verified Elder status only as the final eligibility tie-breaker", () => {
    const result = new OrderedRulesStrategy().recommend(context({
      members: [
        member("#OUT", { availability: "unavailable", townHallLevel: 15 }),
        member("#MEMBER", { assignedOpportunities: 1, completedAssignedAttacks: 1, townHallLevel: 15, clanRole: "member" }),
        member("#ELDER", { assignedOpportunities: 1, completedAssignedAttacks: 1, townHallLevel: 15, clanRole: "elder" }),
      ],
      currentLineup: [{ playerTag: "#OUT", position: 11, isCore: false }],
    }));

    expect(result.changes[0]?.inPlayerTag).toBe("#ELDER");
    expect(result.changes[0]?.reasons.map(({ code }) => code)).toContain("elder_tiebreaker");
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

  it("uses the overall rating before current-CWL tie-breakers and returns display names", () => {
    const result = new OrderedRulesStrategy().recommend(context({
      members: [
        member("#OUT", { name: "Outgoing", availability: "unavailable" }),
        member("#REGULAR", { name: "Regular Reliable", overallRating: 91, regularWarsObserved: 4, regularWarsParticipated: 4 }),
        member("#CURRENT", { name: "Current Reliable", overallRating: 72 }),
      ],
    }));

    expect(result.changes[0]).toMatchObject({
      outPlayerTag: "#OUT",
      inPlayerTag: "#REGULAR",
      outPlayerName: "Outgoing",
      inPlayerName: "Regular Reliable",
    });
    expect(result.changes[0]?.reasons.map(({ code }) => code)).toContain("overall_rating_blended");
  });

  it("records that a rating built on regular-war history alone is what ranked the substitute", () => {
    const result = new OrderedRulesStrategy().recommend(context({
      members: [
        member("#OUT", { name: "Outgoing", availability: "unavailable" }),
        member("#DAYONE", { name: "Day One", overallRating: 80, ratingBasis: "regular_only" }),
        member("#LOWER", { name: "Lower", overallRating: 40, ratingBasis: "regular_only" }),
      ],
    }));

    expect(result.changes[0]?.inPlayerTag).toBe("#DAYONE");
    expect(result.changes[0]?.reasons.map(({ code }) => code)).toContain("overall_rating_regular_only");
  });

  /* Regular-war history reaches the ranking ONLY through `overallRating`, which
     the database computes (#89). These raw fields travel with a member for the
     surfaces to show; they are never a term of their own here, and a rule that
     started reading them would be scoring the same evidence twice. */
  it("does not rank on raw regular-war fields, only on the rating built from them", () => {
    const result = new OrderedRulesStrategy().recommend(context({
      members: [
        member("#OUT", { name: "Outgoing", availability: "unavailable" }),
        member("#A", { name: "No regular evidence" }),
        member("#Z", { name: "Observed regular evidence", regularWarsObserved: 6, regularWarsParticipated: 6, regularActivityScore: 100, regularPerformanceScore: 100 }),
      ],
    }));

    expect(result.changes[0]?.inPlayerTag).toBe("#A");
    expect(result.changes[0]?.reasons.some(({ code }) => code.includes("regular"))).toBe(false);
  });
});
