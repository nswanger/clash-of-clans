import { describe, expect, it } from "vitest";
import {
  availabilitySchema,
  leaderDecisionSchema,
  memberFactsSchema,
  priorityModeSchema,
  recommendationResultSchema,
  seasonSettingsSchema,
} from "./index.js";

describe("seasonSettingsSchema", () => {
  it("defaults a casual 15-player season", () => {
    expect(seasonSettingsSchema.parse({ warSize: 15 })).toMatchObject({
      targetCoreSize: 10,
      rotationPositions: 5,
      priorityMode: "balanced",
      eightStarRotationEnabled: true,
    });
  });

  it("rejects core and rotation counts that do not fill the lineup", () => {
    expect(() => seasonSettingsSchema.parse({
      warSize: 30,
      targetCoreSize: 25,
      rotationPositions: 10,
    })).toThrow();
  });

  it("defaults a casual 30-player season", () => {
    expect(seasonSettingsSchema.parse({ warSize: 30 })).toMatchObject({
      targetCoreSize: 20,
      rotationPositions: 10,
    });
  });

  it("accepts standings-first priority", () => {
    expect(seasonSettingsSchema.parse({
      warSize: 15,
      priorityMode: "standings_first",
    }).priorityMode).toBe("standings_first");
  });

  it("rejects invalid enums", () => {
    expect(() => availabilitySchema.parse("maybe")).toThrow();
    expect(() => priorityModeSchema.parse("performance_first")).toThrow();
  });
});

const validMemberFacts = {
  playerTag: "#PLAYER",
  name: "Sam",
  townHallLevel: 16,
  availability: "available",
  assignedOpportunities: 4,
  completedAssignedAttacks: 3,
  stars: 7,
  eightStarEligible: false,
} as const;

describe("memberFactsSchema", () => {
  it("derives current-CWL reliability", () => {
    expect(memberFactsSchema.parse(validMemberFacts).reliability).toBe(0.75);
  });

  it("uses no reliability when there are no opportunities", () => {
    expect(memberFactsSchema.parse({
      ...validMemberFacts,
      assignedOpportunities: 0,
      completedAssignedAttacks: 0,
    }).reliability).toBeNull();
  });

  it("rejects more completed attacks than opportunities", () => {
    expect(() => memberFactsSchema.parse({
      ...validMemberFacts,
      assignedOpportunities: 2,
      completedAssignedAttacks: 3,
    })).toThrow();
  });
});

const proposal = recommendationResultSchema.parse({
  strategyVersion: "ordered-rules-v1",
  changes: [{
    outPlayerTag: "#OUT",
    inPlayerTag: "#IN",
    reasons: [{ code: "missed_attack", explanation: "Missed an assigned attack" }],
  }],
  exclusions: [],
  contacts: [],
  coverageGaps: [],
  confidenceNotes: [],
});

describe("leaderDecisionSchema", () => {
  it("records an approved proposal with actor and timestamp", () => {
    expect(leaderDecisionSchema.parse({
      proposalId: "proposal-1",
      status: "approved",
      proposal,
      proposedAt: "2026-07-11T14:00:00.000Z",
      decidedAt: "2026-07-11T14:05:00.000Z",
      actorId: "discord-user-1",
      finalChanges: proposal.changes,
    }).status).toBe("approved");
  });

  it("requires override metadata and preserves original proposal", () => {
    expect(() => leaderDecisionSchema.parse({
      proposalId: "proposal-1",
      status: "overridden",
      proposal,
      proposedAt: "2026-07-11T14:00:00.000Z",
      decidedAt: "2026-07-11T14:05:00.000Z",
      actorId: "discord-user-1",
      finalChanges: [],
    })).toThrow();

    const decision = leaderDecisionSchema.parse({
      proposalId: "proposal-1",
      status: "overridden",
      proposal,
      proposedAt: "2026-07-11T14:00:00.000Z",
      decidedAt: "2026-07-11T14:05:00.000Z",
      actorId: "discord-user-1",
      overrideNote: "Keeping the original player for Town Hall coverage",
      finalChanges: [],
    });
    expect(decision.proposal.changes).toEqual(proposal.changes);
    expect(decision.status).toBe("overridden");
    if (decision.status === "overridden") {
      expect(decision.finalChanges).toEqual([]);
    }
  });
});
