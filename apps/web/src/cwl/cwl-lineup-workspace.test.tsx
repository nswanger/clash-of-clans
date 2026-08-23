import { describe, expect, it } from "vitest";
import {
  hasRevisionConflict,
  isBonusSecured,
  membershipDiff,
  needsBonusTurn,
  pendingChecklist,
  rankCandidates,
  sortBonusPriority,
  unsavedChangeCount,
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
    ratingBasis: null,
    cwlScore: null,
    regularScore: null,
    regularWindowFrom: null,
    regularWindowTo: null,
    regularWindowFromBasis: null,
    regularWarsObserved: 0,
    regularWarsParticipated: 0,
    regularWarsIncomplete: 0,
    regularAvailableAttacks: 0,
    regularAssignedAttacks: 0,
    regularAttacksMade: 0,
    regularStars: 0,
    regularActivityScore: null,
    regularPerformanceScore: null,
    regularStarsPerAttack: null,
    regularOpportunityScore: null,
    regularQualityScore: null,
    regularLastObservedAt: null,
    overallRating: null,
    cwlWarsParticipated: 0,
    bonusPriorityScore: null,
    ...overrides,
  };
}

describe("bonus signals", () => {
  it("treats eight stars as secured bonus eligibility", () => {
    expect(isBonusSecured(member({ stars: 7 }))).toBe(false);
    expect(isBonusSecured(member({ stars: 8 }))).toBe(true);
  });

  it("marks only available, unassigned, under-target members as needing a turn", () => {
    expect(needsBonusTurn(member({ availability: "available" }))).toBe(true);
    expect(needsBonusTurn(member({ availability: "unknown" }))).toBe(false);
    expect(needsBonusTurn(member({ availability: "available", assignedAttacks: 1 }))).toBe(false);
    expect(needsBonusTurn(member({ availability: "available", stars: 8 }))).toBe(false);
  });

  it("ranks qualified contributors before below-target members, by total stars", () => {
    const qualified = member({ name: "Qualified", stars: 8, cwlWarsParticipated: 3 });
    const belowTarget = member({ name: "Below target", stars: 7, cwlWarsParticipated: 1 });
    expect(sortBonusPriority(qualified, belowTarget)).toBeLessThan(0);

    const broader = member({ name: "Broader", stars: 16, cwlWarsParticipated: 4 });
    const efficient = member({ name: "Efficient", stars: 8, cwlWarsParticipated: 1 });
    expect(sortBonusPriority(broader, efficient)).toBeLessThan(0);
  });
});

describe("candidate ranking", () => {
  const roster = [
    member({ playerTag: "#SECURED", name: "Secured", availability: "available", stars: 9, overallRating: 95 }),
    member({ playerTag: "#TURN", name: "Owed a turn", availability: "available", stars: 2, overallRating: 40 }),
    member({ playerTag: "#SOLID", name: "Solid", availability: "available", stars: 3, assignedAttacks: 4, overallRating: 88 }),
    member({ playerTag: "#UNKNOWN", name: "Unknown", availability: "unknown", stars: 1, overallRating: 99 }),
    member({ playerTag: "#OUT", name: "Unavailable", availability: "unavailable", stars: 0, overallRating: 99 }),
  ];

  it("puts rotation need above raw strength, and availability above both", () => {
    /* Ranking by rating alone floats the secured members to the top, which is
     * exactly backwards for bonus fairness — that is the whole point of the
     * rotation term sitting above rating. */
    expect(rankCandidates(roster, [], "").map((candidate) => candidate.playerTag))
      .toEqual(["#TURN", "#SOLID", "#SECURED", "#UNKNOWN", "#OUT"]);
  });

  it("never offers someone already in the lineup", () => {
    expect(rankCandidates(roster, ["#TURN"], "").map((candidate) => candidate.playerTag)).not.toContain("#TURN");
  });

  it("searches by name without disturbing the ranking", () => {
    expect(rankCandidates(roster, [], "un").map((candidate) => candidate.playerTag)).toEqual(["#UNKNOWN", "#OUT"]);
  });
});

describe("membership diff", () => {
  it("pairs a removal with an addition into one swap, because that is one act in the game", () => {
    expect(membershipDiff(["#A", "#B"], ["#A", "#C"]))
      .toEqual({ swaps: [{ out: "#B", in: "#C" }], added: [], removed: [] });
  });

  it("reports unpaired halves separately", () => {
    expect(membershipDiff(["#A", "#B"], ["#A"])).toEqual({ swaps: [], added: [], removed: ["#B"] });
    expect(membershipDiff(["#A"], ["#A", "#B"])).toEqual({ swaps: [], added: ["#B"], removed: [] });
  });

  it("sees no membership change in a pure reorder", () => {
    expect(membershipDiff(["#A", "#B"], ["#B", "#A"])).toEqual({ swaps: [], added: [], removed: [] });
  });
});

describe("the in-game checklist", () => {
  it("is the saved plan minus the baseline, not the draft minus the saved plan", () => {
    /* #21's finding: merging the two baselines is what made the checklist
     * evaporate on Save — the exact moment you switch to Clash to act on it. */
    const baseline = ["#A", "#B"];
    const saved = ["#A", "#C"];
    expect(pendingChecklist(baseline, saved)).toEqual([{ key: "swap:#B>#C", out: "#B", in: "#C" }]);
  });

  it("survives a save, because saving moves the plan and not the game", () => {
    const baseline = ["#A", "#B"];
    expect(pendingChecklist(baseline, ["#A", "#C"])).toHaveLength(1);
    // the leader saves again, swapping a second member; the game still holds the baseline
    expect(pendingChecklist(baseline, ["#D", "#C"])).toHaveLength(2);
  });

  it("empties once the baseline has caught up with the plan", () => {
    expect(pendingChecklist(["#A", "#C"], ["#A", "#C"])).toEqual([]);
  });

  it("leads with removals, because the game refuses an add before a remove at war size", () => {
    const items = pendingChecklist(["#A", "#B"], ["#A", "#C", "#D"]);
    expect(items.map((item) => item.key)).toEqual(["swap:#B>#C", "add:#D"]);
    expect(items.findIndex((item) => item.out)).toBeLessThan(items.findIndex((item) => !item.out));
  });

  it("says nothing about order, because the game orders by base weight", () => {
    expect(pendingChecklist(["#A", "#B"], ["#B", "#A"])).toEqual([]);
  });
});

describe("the unsaved count", () => {
  const none = new Set<string>();

  it("counts a swap once, not as a removal plus an addition", () => {
    expect(unsavedChangeCount(["#A", "#B"], ["#A", "#C"], none)).toBe(1);
  });

  it("counts a move, because plan order is a hand-kept mirror of in-game order", () => {
    expect(unsavedChangeCount(["#A", "#B"], ["#B", "#A"], new Set(["#A"]))).toBe(1);
  });

  it("does not count a member as both swapped in and moved", () => {
    expect(unsavedChangeCount(["#A", "#B"], ["#A", "#C"], new Set(["#C"]))).toBe(1);
  });

  it("is zero when nothing was touched", () => {
    expect(unsavedChangeCount(["#A", "#B"], ["#A", "#B"], none)).toBe(0);
  });
});

describe("the revision conflict", () => {
  it("fires only when the plan moved under a checklist that is part-way through", () => {
    expect(hasRevisionConflict(12, 13, 2)).toBe(true);
  });

  it("stays quiet for an untouched checklist, which just recomputes", () => {
    expect(hasRevisionConflict(12, 13, 0)).toBe(false);
  });

  it("stays quiet while the plan has not moved", () => {
    expect(hasRevisionConflict(12, 12, 2)).toBe(false);
  });
});
