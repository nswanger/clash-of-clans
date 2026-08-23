import { describe, expect, it } from "vitest";
import { clockText, coarseText, nextCwlStart, remainingUntilNextCwl, seasonName } from "./cwl-countdown.js";

describe("seasonName", () => {
  /* The season id is a key everywhere else in the app and a date exactly here. */
  it("reads the season id as a month rather than matching it as one", () => {
    expect(seasonName("2026-08")).toBe("August 2026");
    expect(seasonName("2026-01")).toBe("January 2026");
    expect(seasonName("2026-12")).toBe("December 2026");
  });

  /* #91: the shape the API ACTUALLY returns. Every id in production is a date,
     so this was the only case that mattered and the only one not covered — the
     surface printed "2026-08-01 is finished." for the whole of that season. */
  it("reads the API's own date-shaped season id as a month", () => {
    expect(seasonName("2026-08-01")).toBe("August 2026");
    expect(seasonName("2026-01-01")).toBe("January 2026");
  });

  /* An id in an unexpected shape is printed rather than mangled into a month
     that does not exist — the same failure the phase guard takes. */
  it("prints an id that is not a month unchanged", () => {
    expect(seasonName("legacy-season")).toBe("legacy-season");
  });
});

describe("nextCwlStart", () => {
  it("targets 05:00 UTC on the 1st of the next month", () => {
    expect(nextCwlStart(new Date("2026-08-20T12:00:00Z")).toISOString()).toBe("2026-09-01T05:00:00.000Z");
  });

  it("rolls the year over in December", () => {
    expect(nextCwlStart(new Date("2026-12-31T23:59:59Z")).toISOString()).toBe("2027-01-01T05:00:00.000Z");
  });

  /* ON THE 1ST THE TARGET IS THAT DAY'S ROLL. The prototype always named the
     following month, which is wrong twice on the one day it matters: before
     05:00 it claimed a month's wait when the season starts in hours. */
  it("counts to later the same day on the 1st before the roll", () => {
    expect(remainingUntilNextCwl(new Date("2026-09-01T04:00:00Z"))).toBe(3600000);
  });

  /* And after 05:00 on the 1st it goes negative, which is the surface's floor
     and not this function's job to hide. Rolling to the following month there
     would claim a month's wait at the moment CWL is actually starting. */
  it("goes negative once the target has passed", () => {
    expect(remainingUntilNextCwl(new Date("2026-09-01T05:00:01Z"))).toBeLessThan(0);
    expect(remainingUntilNextCwl(new Date("2026-09-01T23:00:00Z"))).toBeLessThan(0);
  });

  /* The day after, it is counting to the next month again — by which point the
     new season is collected and the surface has self-cleared to the lineup
     anyway. */
  it("counts to the following month from the 2nd onwards", () => {
    expect(nextCwlStart(new Date("2026-09-02T06:00:00Z")).toISOString()).toBe("2026-10-01T05:00:00.000Z");
  });
});

describe("clockText", () => {
  it("renders the drop form at full granularity throughout", () => {
    expect(clockText(9 * 86400000 + 14 * 3600000 + 27 * 60000 + 28000)).toBe("9d 14:27:28");
    expect(clockText(47 * 60000 + 12000)).toBe("00:47:12");
    expect(clockText(9000)).toBe("00:00:09");
  });

  it("floors rather than showing a negative clock", () => {
    expect(clockText(-5000)).toBe("00:00:00");
  });
});

describe("coarseText", () => {
  /* FLOOR, NOT ROUND. The strip's sub-label and the clock render the same
     remainder on the same screen, and rounding made them disagree — "10 days"
     above a clock reading "9d 14:27:28". */
  it("floors to the same day the clock shows", () => {
    expect(coarseText(9 * 86400000 + 14 * 3600000)).toBe("About 9 days");
    expect(coarseText(2 * 86400000 - 1)).toBe("About a day");
  });

  it("says later today inside the last day", () => {
    expect(coarseText(3600000)).toBe("Later today");
  });
});
