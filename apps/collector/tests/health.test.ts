import { describe, expect, it } from "vitest";
import { evaluateHealth } from "../src/schedule.js";

describe("collector health", () => {
  const now = new Date("2026-07-11T12:00:00.000Z");

  it("becomes stale after two missed expected collection windows", () => {
    expect(evaluateHealth({
      now,
      activeCwl: true,
      lastSuccessfulAt: new Date("2026-07-11T09:59:59.999Z"),
      latestStatus: "healthy",
    })).toEqual({ status: "stale", exitCode: 1 });
    expect(evaluateHealth({
      now,
      activeCwl: false,
      lastSuccessfulAt: new Date("2026-07-09T11:59:59.999Z"),
      latestStatus: "healthy",
    })).toEqual({ status: "stale", exitCode: 1 });
  });

  it("preserves invalid_ip as a distinct actionable state", () => {
    expect(evaluateHealth({
      now,
      activeCwl: true,
      lastSuccessfulAt: new Date("2026-07-11T11:30:00.000Z"),
      latestStatus: "invalid_ip",
    })).toEqual({ status: "invalid_ip", exitCode: 1 });
  });

  it("reports healthy without returning sensitive collection details", () => {
    expect(evaluateHealth({
      now,
      activeCwl: true,
      lastSuccessfulAt: new Date("2026-07-11T11:00:00.000Z"),
      latestStatus: "healthy",
    })).toEqual({ status: "healthy", exitCode: 0 });
  });
});
