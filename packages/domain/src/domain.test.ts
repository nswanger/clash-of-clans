import { describe, expect, it } from "vitest";
import { seasonSettingsSchema } from "./domain.js";

describe("seasonSettingsSchema", () => {
  it("defaults a casual 15-player season", () => {
    expect(seasonSettingsSchema.parse({ warSize: 15 })).toMatchObject({
      targetCoreSize: 10,
      rotationPositions: 5,
      priorityMode: "balanced",
      eightStarRotationEnabled: true,
    });
  });

  it("rejects core and rotation counts that do not fill the lineup", () => {
    expect(() => seasonSettingsSchema.parse({
      warSize: 30,
      targetCoreSize: 25,
      rotationPositions: 10,
    })).toThrow();
  });
});
