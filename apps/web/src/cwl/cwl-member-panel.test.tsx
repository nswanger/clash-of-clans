import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BenchPanel, MemberPanel } from "./cwl-lineup-workspace.js";
import type { CwlLineupMember } from "../data/operations.js";

function member(overrides: Partial<CwlLineupMember> = {}): CwlLineupMember {
  return {
    playerTag: "#SAM",
    name: "Sam",
    townHallLevel: 16,
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

const noop = () => {};

describe("a bench row (#114)", () => {
  it("adds on the primary target and opens the member on the secondary one", () => {
    const onChoose = vi.fn();
    const onOpen = vi.fn();
    render(<BenchPanel
      candidates={[member()]} lineupFull={false} search=""
      onSearch={noop} onChoose={onChoose} onOpen={onOpen} onClose={noop}
    />);

    fireEvent.click(screen.getByRole("button", { name: /^Sam/ }));
    expect(onChoose).toHaveBeenCalledWith("#SAM");
    expect(onOpen).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Open Sam" }));
    expect(onOpen).toHaveBeenCalledWith("#SAM");
    expect(onChoose).toHaveBeenCalledTimes(1);
  });
});

describe("the member panel (#114)", () => {
  function benched(overrides: { lineupFull?: boolean; locked?: boolean; onAdd?: () => void; onAvailability?: (value: string) => void } = {}) {
    return render(<MemberPanel
      member={member()} candidates={[]} search="" locked={overrides.locked ?? false}
      onSearch={noop} onChoose={noop} onClose={noop}
      onAvailability={overrides.onAvailability ?? noop}
      action={{ kind: "add", lineupFull: overrides.lineupFull ?? false, onAdd: overrides.onAdd ?? noop }}
    />);
  }

  it("for a benched member carries the availability set and Add to lineup, and no candidate list", () => {
    const onAdd = vi.fn();
    const onAvailability = vi.fn();
    benched({ onAdd, onAvailability });

    expect(screen.getByRole("dialog", { name: "Sam" })).toBeInTheDocument();
    /* The seam the issue names: availability writes go through the same path
       the lineup member's panel uses, so nothing about saving changes. */
    fireEvent.click(screen.getByRole("button", { name: "Unavailable" }));
    expect(onAvailability).toHaveBeenCalledWith("unavailable");
    expect(screen.getByRole("button", { name: "Unknown", pressed: true })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add to lineup" }));
    expect(onAdd).toHaveBeenCalledTimes(1);

    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
    expect(screen.queryByRole("searchbox", { name: "Find a member" })).not.toBeInTheDocument();
    expect(screen.queryByText("Replace with")).not.toBeInTheDocument();
  });

  it("cannot add to a full lineup, and says so where the button is", () => {
    benched({ lineupFull: true });
    expect(screen.getByRole("button", { name: "Add to lineup" })).toBeDisabled();
    expect(screen.getByText(/lineup is full/i)).toBeInTheDocument();
  });

  it("cannot add while the day is locked", () => {
    benched({ locked: true });
    expect(screen.getByRole("button", { name: "Add to lineup" })).toBeDisabled();
  });

  it("for a lineup member keeps Remove and the candidate list, with no Add to lineup", () => {
    render(<MemberPanel
      member={member()} candidates={[member({ playerTag: "#KIRA", name: "Kira" })]} search="" locked={false}
      onSearch={noop} onChoose={noop} onClose={noop} onAvailability={noop}
      action={{ kind: "remove", onRemove: noop }}
    />);
    expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Find a member" })).toBeInTheDocument();
    expect(screen.getByText("Replace with")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add to lineup" })).not.toBeInTheDocument();
  });
});
