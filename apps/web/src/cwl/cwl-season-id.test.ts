import { describe, expect, it } from "vitest";
import { seasonMonth, seasonMonthKey } from "./cwl-season-id.js";

describe("seasonMonth", () => {
  /* The shape the Clash API actually returns, checked against stored
     `raw_snapshots` for `league_group` (#91). This is the case that was broken
     in production, so it is the case that leads. */
  it("reads the API's own date-shaped season id", () => {
    expect(seasonMonth("2026-08-01")).toEqual({ year: 2026, month: 8 });
    expect(seasonMonth("2026-01-01")).toEqual({ year: 2026, month: 1 });
    expect(seasonMonth("2026-12-01")).toEqual({ year: 2026, month: 12 });
  });

  /* The API's contract is not ours to assume, and a season already stored in
     the shorter form must keep working. */
  it("still reads a month-shaped season id", () => {
    expect(seasonMonth("2026-08")).toEqual({ year: 2026, month: 8 });
  });

  /* The month is as written, not a JavaScript month index. A silently
     zero-based field reads correctly right up until it does not. */
  it("reports the month as written rather than as a Date index", () => {
    expect(seasonMonth("2026-01-01")?.month).toBe(1);
  });

  it("reports nothing for an id it cannot read as a month", () => {
    for (const id of ["", "2026", "26-08", "2026-8", "August 2026", "2026-08-01T00:00:00Z"]) {
      expect(seasonMonth(id)).toBeUndefined();
    }
  });

  /* Well-shaped and still not a month. Rejected here so no caller has to
     defend against a 13th month or a zeroth one. */
  it("rejects a well-shaped id whose month is not a month", () => {
    expect(seasonMonth("2026-00-01")).toBeUndefined();
    expect(seasonMonth("2026-13-01")).toBeUndefined();
  });
});

describe("seasonMonthKey", () => {
  it("pads the month so keys compare as text", () => {
    expect(seasonMonthKey({ year: 2026, month: 9 })).toBe("2026-09");
  });

  /* THE WHOLE REASON THE KEY EXISTS. `"2026-08-01" < "2026-09"` happens to be
     true, but the app compares a stored id against a month it builds itself,
     and two ids in different shapes do not sort against each other the way that
     comparison needs. Canonicalising both sides removes the question. */
  it("makes the two stored shapes comparable to each other", () => {
    const fromDate = seasonMonthKey(seasonMonth("2026-08-01")!);
    const fromMonth = seasonMonthKey(seasonMonth("2026-08")!);

    expect(fromDate).toBe(fromMonth);
    expect(fromDate < seasonMonthKey(seasonMonth("2026-09-01")!)).toBe(true);
    expect(seasonMonthKey(seasonMonth("2025-12-01")!) < fromDate).toBe(true);
  });
});
