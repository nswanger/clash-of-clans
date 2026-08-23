import { describe, expect, it } from "vitest";
import { defaultCwlPhase, hashForPhase, phaseFromHash, seasonFromHash, type CwlPhaseWarDay } from "./cwl-phase.js";
import type { CwlWarState } from "../data/operations.js";
import { currentLineupDay } from "./cwl-route.js";

const august = new Date("2026-08-20T00:00:00Z");

/* War days as the ladder reads them. `end_time` defaults to null because the
   markers that need it are named one at a time below, and a day with no end
   time is the case marker 2 has nothing to measure. */
function days(states: readonly CwlWarState[], endTime: string | null = null): CwlPhaseWarDay[] {
  return states.map((state) => ({ state, endTime }));
}

function markers(seasonId: string, warDays: CwlPhaseWarDay[], bonusesAdministeredAt: string | null = null) {
  return { seasonId, warDays, bonusesAdministeredAt };
}

describe("defaultCwlPhase", () => {
  it("opens on the lineup while any war day is still live", () => {
    expect(defaultCwlPhase(markers("2026-08", days(["warEnded", "warEnded", "inWar"])), august)).toBe("lineup");
    expect(defaultCwlPhase(markers("2026-08", days(["warEnded", "preparation"])), august)).toBe("lineup");
  });

  it("opens on review once every logged day has ended", () => {
    expect(defaultCwlPhase(markers("2026-08", days(["warEnded", "warEnded"])), august)).toBe("review");
  });

  it("opens on the lineup for a season that has not been played yet", () => {
    expect(defaultCwlPhase(markers("2026-08", []), august)).toBe("lineup");
    expect(defaultCwlPhase(markers("2026-08", days(["unknown"])), august)).toBe("lineup");
  });

  /* A season id in an unexpected shape fails the guard rather than throwing on
     it: the war states are the primary marker and this is the backstop. */
  it("falls back to the war states when the season id is not a month", () => {
    expect(defaultCwlPhase(markers("legacy-season", days(["inWar"])), august)).toBe("lineup");
    expect(defaultCwlPhase(markers("legacy-season", days(["warEnded"])), august)).toBe("review");
  });

  /* ---- the three resting markers, in the order the ladder reads them ---- */

  /* Marker 1: the observation wave 3 shipped the control for. It outranks every
     war state, because a leader recording that the medals are out is a stronger
     fact than a row collection has not caught up with. */
  it("stands down once the bonuses are recorded as administered", () => {
    expect(defaultCwlPhase(markers("2026-08", days(["warEnded", "warEnded"]), "2026-08-14T18:22:00Z"), august)).toBe("resting");
    expect(defaultCwlPhase(markers("2026-08", days(["warEnded", "inWar"]), "2026-08-14T18:22:00Z"), august)).toBe("resting");
  });

  /* Marker 2: the elapsed-time fallback for a season nobody ever marks. Seven
     days after the FINAL war ended, which is the latest end time on the season
     rather than the first. */
  it("stands down seven days after the final war ended, and not before", () => {
    const sixDays = days(["warEnded", "warEnded"], "2026-08-14T12:00:00Z");
    expect(defaultCwlPhase(markers("2026-08", sixDays), august)).toBe("review");

    const mixed: CwlPhaseWarDay[] = [
      { state: "warEnded", endTime: "2026-08-01T12:00:00Z" },
      { state: "warEnded", endTime: "2026-08-12T12:00:00Z" },
    ];
    expect(defaultCwlPhase(markers("2026-08", mixed), august)).toBe("resting");
  });

  /* Marker 3, and the case it exists for: a season whose end was never collected
     has NO end time at all, so marker 2 has nothing to measure and the month
     guard is the only rung that can fire. */
  it("stands down for a stale season with no end time at all, past the day-of-month floor", () => {
    expect(defaultCwlPhase(markers("2026-07", days(["warEnded", "inWar"])), august)).toBe("resting");
  });

  /* #91, AND THE REGRESSION THIS FILE COULD NOT SEE. Every real season id is
     `YYYY-MM-DD`, which the guard's old pattern did not match, so it returned
     false for every season the app has ever held and marker 3 never fired. The
     rung was retired silently on the day it shipped. */
  it("fires the month guard on the API's own date-shaped season id", () => {
    expect(defaultCwlPhase(markers("2026-07-01", days(["warEnded", "inWar"])), august)).toBe("resting");
  });

  /* The other half of the same regression: a date-shaped id must not read as
     earlier than the month it names. */
  it("does not call the current season an earlier month when the id is date-shaped", () => {
    expect(defaultCwlPhase(markers("2026-08-01", days(["warEnded", "inWar"])), august)).toBe("lineup");
  });

  /* THE FLOOR. `namesAnEarlierMonth` flips at midnight on the 1st, which is
     roughly when the next CWL starts — so without a day-of-month floor a failed
     collection drops the leader into stand down at exactly the moment the new
     season begins. Early in the month the previous season still reads as review,
     which is the surface that can still be acted on. */
  it("reads review rather than stand down early in the month, when the next season is starting", () => {
    const firstOfSeptember = new Date("2026-09-01T06:00:00Z");
    expect(defaultCwlPhase(markers("2026-08", days(["warEnded", "inWar"])), firstOfSeptember)).toBe("review");

    const seventhOfSeptember = new Date("2026-09-07T06:00:00Z");
    expect(defaultCwlPhase(markers("2026-08", days(["warEnded", "inWar"])), seventhOfSeptember)).toBe("review");

    const eighthOfSeptember = new Date("2026-09-08T06:00:00Z");
    expect(defaultCwlPhase(markers("2026-08", days(["warEnded", "inWar"])), eighthOfSeptember)).toBe("resting");
  });

  /* The floor is a floor on the BACKSTOP only. A season with real end times a
     week old stands down whatever the day of the month is, because that is
     marker 2 answering rather than a guess about collection. */
  it("keeps the floor off the elapsed-time marker", () => {
    const firstOfSeptember = new Date("2026-09-01T06:00:00Z");
    expect(defaultCwlPhase(markers("2026-08", days(["warEnded"], "2026-08-20T12:00:00Z")), firstOfSeptember)).toBe("resting");
  });
});

describe("phaseFromHash", () => {
  it("reads an explicit phase from the query string", () => {
    expect(phaseFromHash("#/cwl?phase=review")).toBe("review");
    expect(phaseFromHash("#/cwl?phase=lineup")).toBe("lineup");
    /* The URL carries the model's word, not the label a leader reads: `Stand
       down` is what the strip says and `resting` is what the state is. */
    expect(phaseFromHash("#/cwl?phase=resting")).toBe("resting");
  });

  /* An unrecognised phase falls back to the default rather than erroring: the
     default is always a correct answer, and a bad link should land somewhere
     usable. */
  it("ignores an absent or unrecognised phase", () => {
    expect(phaseFromHash("#/cwl")).toBeUndefined();
    expect(phaseFromHash("#/cwl?phase=standdown")).toBeUndefined();
    expect(phaseFromHash("#/cwl?day=3")).toBeUndefined();
  });
});

describe("hashForPhase", () => {
  it("names every phase, including the one the route defaults to", () => {
    expect(hashForPhase("lineup")).toBe("#/cwl?phase=lineup");
    expect(hashForPhase("review")).toBe("#/cwl?phase=review");
    expect(hashForPhase("resting")).toBe("#/cwl?phase=resting");
  });

  /* The regression that makes this worth its own test. Omitting the parameter
     for the default phase strands the leader in the direction ADR 0002 wrote the
     control to prevent: once a season is over the default at bare `#/cwl` is
     review, so a Lineup press that produced `#/cwl` would assign the hash the
     page is already on — no `hashchange`, no re-render, no way back. */
  it("produces a hash that differs from the bare route, so the control always moves", () => {
    for (const phase of ["lineup", "review", "resting"] as const) {
      expect(hashForPhase(phase)).not.toBe("#/cwl");
      expect(phaseFromHash(hashForPhase(phase))).toBe(phase);
    }
  });

  /* #56. The season rides beside the phase rather than replacing it, so the
     strip still knows which phase it is in on a previous season's link. */
  it("carries the season beside the phase, and round-trips it", () => {
    const hash = hashForPhase("review", "2026-07");

    expect(hash).toBe("#/cwl?phase=review&season=2026-07");
    expect(phaseFromHash(hash)).toBe("review");
    expect(seasonFromHash(hash)).toBe("2026-07");
  });

  it("omits the season when none is named", () => {
    expect(hashForPhase("review")).toBe("#/cwl?phase=review");
    expect(seasonFromHash(hashForPhase("review"))).toBeUndefined();
  });
});

describe("seasonFromHash", () => {
  it("is absent on a hash with no query and on one that does not name a season", () => {
    expect(seasonFromHash("#/cwl")).toBeUndefined();
    expect(seasonFromHash("#/cwl?phase=review")).toBeUndefined();
  });

  /* Unvalidated on purpose: which seasons exist is the loader's answer, and it
     falls back to the current one rather than rejecting a bad link. */
  it("reports a season it cannot vouch for rather than dropping it", () => {
    expect(seasonFromHash("#/cwl?phase=review&season=1999-01")).toBe("1999-01");
  });
});

describe("currentLineupDay", () => {
  it("names the latest day still in preparation or in war", () => {
    expect(currentLineupDay([
      { warDay: 1, state: "warEnded" },
      { warDay: 2, state: "inWar" },
      { warDay: 3, state: "preparation" },
    ])).toBe(3);
  });

  it("falls back to day one when no day is live", () => {
    expect(currentLineupDay([{ warDay: 1, state: "warEnded" }])).toBe(1);
    expect(currentLineupDay([])).toBe(1);
  });
});
