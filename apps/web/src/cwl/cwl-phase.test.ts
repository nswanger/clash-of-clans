import { describe, expect, it } from "vitest";
import { defaultCwlPhase, hashForPhase, phaseFromHash } from "./cwl-phase.js";
import { currentLineupDay } from "./cwl-route.js";

const august = new Date("2026-08-20T00:00:00Z");

describe("defaultCwlPhase", () => {
  it("opens on the lineup while any war day is still live", () => {
    expect(defaultCwlPhase("2026-08", ["warEnded", "warEnded", "inWar"], august)).toBe("lineup");
    expect(defaultCwlPhase("2026-08", ["warEnded", "preparation"], august)).toBe("lineup");
  });

  it("opens on review once every logged day has ended", () => {
    expect(defaultCwlPhase("2026-08", ["warEnded", "warEnded"], august)).toBe("review");
  });

  /* The date guard is not redundant. A missed collection run at the end of a
     season leaves the final day never marked ended, and without it the app sits
     in the lineup phase indefinitely — presenting a stale, editable lineup for a
     war that finished weeks ago (ADR 0002). */
  it("opens on review for an earlier month even when a war day looks live", () => {
    expect(defaultCwlPhase("2026-07", ["warEnded", "inWar"], august)).toBe("review");
  });

  it("opens on the lineup for a season that has not been played yet", () => {
    expect(defaultCwlPhase("2026-08", [], august)).toBe("lineup");
    expect(defaultCwlPhase("2026-08", ["unknown"], august)).toBe("lineup");
  });

  /* A season id in an unexpected shape fails the guard rather than throwing on
     it: the war states are the primary marker and this is the backstop. */
  it("falls back to the war states when the season id is not a month", () => {
    expect(defaultCwlPhase("legacy-season", ["inWar"], august)).toBe("lineup");
    expect(defaultCwlPhase("legacy-season", ["warEnded"], august)).toBe("review");
  });
});

describe("phaseFromHash", () => {
  it("reads an explicit phase from the query string", () => {
    expect(phaseFromHash("#/cwl?phase=review")).toBe("review");
    expect(phaseFromHash("#/cwl?phase=lineup")).toBe("lineup");
  });

  /* An unrecognised phase falls back to the default rather than erroring: the
     default is always a correct answer, and a bad link should land somewhere
     usable. */
  it("ignores an absent or unrecognised phase", () => {
    expect(phaseFromHash("#/cwl")).toBeUndefined();
    expect(phaseFromHash("#/cwl?phase=resting")).toBeUndefined();
    expect(phaseFromHash("#/cwl?day=3")).toBeUndefined();
  });
});

describe("hashForPhase", () => {
  it("names every phase, including the one the route defaults to", () => {
    expect(hashForPhase("lineup")).toBe("#/cwl?phase=lineup");
    expect(hashForPhase("review")).toBe("#/cwl?phase=review");
  });

  /* The regression that makes this worth its own test. Omitting the parameter
     for the default phase strands the leader in the direction ADR 0002 wrote the
     control to prevent: once a season is over the default at bare `#/cwl` is
     review, so a Lineup press that produced `#/cwl` would assign the hash the
     page is already on — no `hashchange`, no re-render, no way back. */
  it("produces a hash that differs from the bare route, so the control always moves", () => {
    for (const phase of ["lineup", "review"] as const) {
      expect(hashForPhase(phase)).not.toBe("#/cwl");
      expect(phaseFromHash(hashForPhase(phase))).toBe(phase);
    }
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
