import { describe, expect, it } from "vitest";
import {
  filterAvailableRotationChanges,
  isAvailableRotationCandidate,
  isBonusSecured,
  isRotationChangeApplied,
  needsBonusTurn,
  sortBonusPriority,
} from "./cwl-lineup-workspace.js";
import type { CwlLineupMember } from "../data/operations.js";

function member(overrides: Partial<CwlLineupMember> = {}): CwlLineupMember {
  return {
    playerTag: "#MEMBER",
    name: "Member",
    townHallLevel: 15,
    role: "member",
    availability: "unknown",
    assignedAttacks: 0,
    completedAttacks: 0,
    stars: 0,
    observed: false,
    currentWarAssignedAttacks: 0,
    currentWarAttacksMade: 0,
    attackEvidenceWarDay: null,
    regularWarsObserved: 0,
    regularWarsParticipated: 0,
    regularAssignedAttacks: 0,
    regularAttacksMade: 0,
    regularParticipationRate: null,
    regularAttackCompletionRate: null,
    overallRating: null,
    cwlWarsParticipated: 0,
    bonusPriorityScore: null,
    ...overrides,
  };
}

describe("CWL rotation signals", () => {
  it("treats eight stars as secured bonus eligibility", () => {
    expect(isBonusSecured(member({ stars: 7 }))).toBe(false);
    expect(isBonusSecured(member({ stars: 8 }))).toBe(true);
  });

  it("ranks qualified contributors before below-target members", () => {
    const qualified = member({ name: "Qualified", stars: 8, cwlWarsParticipated: 3 });
    const belowTarget = member({ name: "Below target", stars: 7, cwlWarsParticipated: 1 });
    expect(sortBonusPriority(qualified, belowTarget)).toBeLessThan(0);
  });

  it("uses total stars before stars per war within the same qualification group", () => {
    const broaderContributor = member({ name: "Broader contributor", stars: 16, cwlWarsParticipated: 4 });
    const efficientContributor = member({ name: "Efficient contributor", stars: 8, cwlWarsParticipated: 1 });
    expect(sortBonusPriority(broaderContributor, efficientContributor)).toBeLessThan(0);
  });

  it("marks only available, unassigned, non-observed members as needing a turn", () => {
    expect(needsBonusTurn(member({ availability: "available" }))).toBe(true);
    expect(needsBonusTurn(member({ availability: "unknown" }))).toBe(false);
    expect(needsBonusTurn(member({ availability: "available", assignedAttacks: 1 }))).toBe(false);
    expect(needsBonusTurn(member({ availability: "available", observed: true }))).toBe(false);
    expect(needsBonusTurn(member({ availability: "available", stars: 8 }))).toBe(false);
  });

  it("allows only available under-target members into rotation recommendations", () => {
    const changes = [
      { outPlayerTag: "#OUT", inPlayerTag: "#AVAILABLE", explanation: "" },
      { outPlayerTag: "#OUT", inPlayerTag: "#UNKNOWN", explanation: "" },
      { outPlayerTag: "#OUT", inPlayerTag: "#UNAVAILABLE", explanation: "" },
      { outPlayerTag: "#OUT", inPlayerTag: "#SECURED", explanation: "" },
      { outPlayerTag: "#OUT", inPlayerTag: "#OBSERVED", explanation: "" },
    ];
    const members = [
      member({ playerTag: "#AVAILABLE", availability: "available", stars: 4 }),
      member({ playerTag: "#UNKNOWN", availability: "unknown", stars: 4 }),
      member({ playerTag: "#UNAVAILABLE", availability: "unavailable", stars: 4 }),
      member({ playerTag: "#SECURED", availability: "available", stars: 8 }),
      member({ playerTag: "#OBSERVED", availability: "available", stars: 4, observed: true }),
    ];

    expect(filterAvailableRotationChanges(changes, members)).toEqual([changes[0]]);
    expect(isAvailableRotationCandidate(members[0]!)).toBe(true);
  });

  it("recognizes a locally applied swap without implying it was saved", () => {
    const change = { outPlayerTag: "#OUT", inPlayerTag: "#IN", explanation: "" };
    expect(isRotationChangeApplied(["#OUT"], change)).toBe(false);
    expect(isRotationChangeApplied(["#IN"], change)).toBe(true);
  });
});
