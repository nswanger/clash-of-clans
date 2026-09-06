import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { memberRating } from "../data/operations.js";
import type { CwlMemberRating } from "../data/operations.js";
import { CwlRatingBreakdown, ratingBasisNote, ratingWindowLabel, ratingWindowLabelShort } from "./cwl-rating.js";

function rating(overrides: Partial<CwlMemberRating> = {}): CwlMemberRating {
  return { ...memberRating(undefined), ...overrides };
}

describe("the window label", () => {
  /* `window_from` is the previous CWL's last war end, so its month IS that
     CWL's month -- which is a claim a leader can check against their own
     memory in a way "the last 30 days" never was. */
  it("names the month of the CWL that closed the window", () => {
    expect(ratingWindowLabel(rating({
      regularWindowFromBasis: "previous_cwl_end",
      regularWindowFrom: "2026-07-05T12:00:00.000Z",
    }))).toBe("since the July CWL");
  });

  it("reads the month in UTC, so a leader east of the line does not see the previous one", () => {
    expect(ratingWindowLabel(rating({
      regularWindowFromBasis: "previous_cwl_end",
      regularWindowFrom: "2026-07-31T23:30:00.000Z",
    }))).toBe("since the July CWL");
  });

  it("falls back to the unnamed form when the bound cannot be read as a date", () => {
    expect(ratingWindowLabel(rating({ regularWindowFromBasis: "previous_cwl_end" })))
      .toBe("since last CWL");
  });

  /* The two bounds are not the same claim, and the fallback has to say it is a
     fallback rather than borrow the rule's wording (#89, and #91's lesson). */
  it("does not claim a previous CWL when it fell back to thirty days", () => {
    expect(ratingWindowLabel(rating({ regularWindowFromBasis: "fixed_30_days" })))
      .toBe("in the 30 days before this CWL");
    expect(ratingWindowLabelShort(rating({ regularWindowFromBasis: "fixed_30_days" })))
      .toBe("in the 30 days before");
  });
});

describe("the basis note", () => {
  it("says nothing extra about the ordinary blended rating", () => {
    expect(ratingBasisNote(rating({ ratingBasis: "blended" }))).toBeNull();
  });

  it("explains a rating that exists before any CWL attack was assigned", () => {
    const note = ratingBasisNote(rating({
      ratingBasis: "regular_only",
      regularWindowFromBasis: "previous_cwl_end",
      regularWindowFrom: "2026-07-05T12:00:00.000Z",
    }));
    expect(note).toMatch(/regular-war activity alone/);
    /* The window belongs to the evidence line above it, once. */
    expect(note).not.toMatch(/July/);
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
      regularWindowFrom: "2026-07-05T12:00:00.000Z",
    })} />);

    expect(screen.getByText(/CWL attacks.*60%/)).toBeTruthy();
    expect(screen.getByText("72")).toBeTruthy();
    expect(screen.getByText(/Regular wars.*40%/)).toBeTruthy();
    expect(screen.getByText("45")).toBeTruthy();
    expect(screen.queryByText(/Weighted/)).toBeNull();
  });

  /* The whole point of #89: somebody who joined none of the window's wars reads
     as a zero against a real denominator, not as missing evidence. */
  it("reads a member who joined none of the window's wars as a zero against the wars they could have joined", () => {
    render(<CwlRatingBreakdown rating={rating({
      ratingBasis: "regular_only", cwlScore: null, regularScore: 0,
      regularWarsObserved: 6, regularWarsParticipated: 0,
      regularAvailableAttacks: 12, regularAttacksMade: 0,
      regularWindowFromBasis: "previous_cwl_end",
      regularWindowFrom: "2026-07-05T12:00:00.000Z",
    })} />);

    expect(screen.getByText("0")).toBeTruthy();
    const evidence = screen.getByText(/wars since the July CWL/);
    expect(evidence.textContent).toContain("0 of 6");
    expect(evidence.textContent).toContain("0 of 12 attacks used");
  });

  /* The evidence sits OUTSIDE the score list, which is the whole point of
     moving it: in the grid it took the same treatment as the two scores and the
     group read as four figures rather than two and their provenance. */
  it("keeps the counts out of the score list so the group reads as two scores", () => {
    const { container } = render(<CwlRatingBreakdown rating={rating({
      ratingBasis: "blended", cwlScore: 72, regularScore: 45,
      regularWarsObserved: 6, regularWarsParticipated: 4,
      regularAvailableAttacks: 12, regularAttacksMade: 8,
      regularWindowFromBasis: "previous_cwl_end",
      regularWindowFrom: "2026-07-05T12:00:00.000Z",
    })} />);

    expect(container.querySelectorAll("dl")).toHaveLength(1);
    expect(container.querySelectorAll("dl dd")).toHaveLength(2);
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
