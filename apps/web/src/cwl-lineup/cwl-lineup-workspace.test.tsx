import { describe, expect, it } from "vitest";
import {
  filterAvailableRotationChanges,
  isAvailableRotationCandidate,
  isBonusSecured,
  isRotationChangeApplied,
  needsBonusTurn,
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
    ...overrides,
  };
}

describe("CWL rotation signals", () => {
  it("treats eight stars as secured bonus eligibility", () => {
    expect(isBonusSecured(member({ stars: 7 }))).toBe(false);
    expect(isBonusSecured(member({ stars: 8 }))).toBe(true);
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
