import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { memberRating } from "../data/operations.js";
import type { CwlMemberRating } from "../data/operations.js";
import { CwlRatingBreakdown, ratingBasisNote, ratingWindowLabel } from "./cwl-rating.js";

function rating(overrides: Partial<CwlMemberRating> = {}): CwlMemberRating {
  return { ...memberRating(undefined), ...overrides };
}

describe("the window label", () => {
  it("names the previous CWL when that is what bounded the window", () => {
    expect(ratingWindowLabel(rating({ regularWindowFromBasis: "previous_cwl_end" })))
      .toBe("since the last CWL");
  });

  /* The two bounds are not the same claim, and the fallback has to say it is a
     fallback rather than borrow the rule's wording (#89, and #91's lesson). */
  it("does not claim a previous CWL when it fell back to thirty days", () => {
    expect(ratingWindowLabel(rating({ regularWindowFromBasis: "fixed_30_days" })))
      .toBe("the 30 days before this CWL");
  });
});

describe("the basis note", () => {
  it("says nothing extra about the ordinary blended rating", () => {
    expect(ratingBasisNote(rating({ ratingBasis: "blended" }))).toBeNull();
  });

  it("explains a rating that exists before any CWL attack was assigned", () => {
    expect(ratingBasisNote(rating({ ratingBasis: "regular_only", regularWindowFromBasis: "previous_cwl_end" })))
      .toMatch(/regular-war activity since the last CWL alone/);
  });

  it("explains a rating whose window observed no regular wars", () => {
    expect(ratingBasisNote(rating({ ratingBasis: "reliability_only" })))
      .toMatch(/No regular wars were observed/);
  });
});

describe("the breakdown", () => {
  it("shows both terms and states the weights once", () => {
    render(<CwlRatingBreakdown rating={rating({
      ratingBasis: "blended", cwlScore: 72, regularScore: 45,
      regularWarsObserved: 6, regularWarsParticipated: 4,
      regularAvailableAttacks: 12, regularAttacksMade: 8,
      regularWindowFromBasis: "previous_cwl_end",
    })} />);

    expect(screen.getByText("CWL attacks")).toBeTruthy();
    expect(screen.getByText("72")).toBeTruthy();
    expect(screen.getByText("Regular wars")).toBeTruthy();
    expect(screen.getByText("45")).toBeTruthy();
    expect(screen.getByText(/Weighted 60% CWL attacks, 40% regular wars/)).toBeTruthy();
  });

  /* The whole point of #89: somebody who joined none of the window's wars reads
     as a zero against a real denominator, not as missing evidence. */
  it("reads a member who joined none of the window's wars as a zero against the wars they could have joined", () => {
    render(<CwlRatingBreakdown rating={rating({
      ratingBasis: "regular_only", cwlScore: null, regularScore: 0,
      regularWarsObserved: 6, regularWarsParticipated: 0,
      regularAvailableAttacks: 12, regularAttacksMade: 0,
      regularWindowFromBasis: "previous_cwl_end",
    })} />);

    expect(screen.getByText("0")).toBeTruthy();
    expect(screen.getByText(/0 of 6 since the last CWL/)).toBeTruthy();
    expect(screen.getByText(/0 of 12 available/)).toBeTruthy();
  });

  /* An empty window is a coverage gap, not a zero. Absence of evidence is never
     a penalty, so there is no "0 of 0" line to misread. */
  it("shows no participation line when the window observed no wars at all", () => {
    render(<CwlRatingBreakdown rating={rating({
      ratingBasis: "reliability_only", cwlScore: 86, regularScore: null,
      regularWarsObserved: 0, regularWindowFromBasis: "fixed_30_days",
    })} />);

    expect(screen.queryByText("Wars joined")).toBeNull();
    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.getByText(/No regular wars were observed/)).toBeTruthy();
  });
});
