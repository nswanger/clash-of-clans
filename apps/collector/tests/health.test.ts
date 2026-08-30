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

  it("holds an out-of-season collector to the idle window, not the active-CWL one", () => {
    // Regression: the health input used to infer an active season from the newest
    // successful league_group snapshot, which between seasons is the previous CWL's
    // final response. That pinned the collector to the one-hour window forever, so a
    // healthy idle collector reported stale on every check.
    expect(evaluateHealth({
      now,
      activeCwl: false,
      lastSuccessfulAt: new Date("2026-07-11T00:00:00.000Z"),
      latestStatus: "partial",
    })).toEqual({ status: "healthy", exitCode: 0 });
  });

  it("reports a behind schema ahead of every other state", () => {
    // Generic unhealthy is not enough: the container reported unhealthy continuously
    // from 2026-08-09 to 2026-08-30 and nothing acted on it, because the signal was
    // always red and carried no content (#81).
    expect(evaluateHealth({
      now,
      activeCwl: false,
      lastSuccessfulAt: new Date("2026-07-11T11:00:00.000Z"),
      latestStatus: "invalid_ip",
      missingMigrations: ["202608300001"],
    })).toEqual({ status: "schema_behind", exitCode: 1 });
  });

  it("stays healthy when no migration is missing", () => {
    expect(evaluateHealth({
      now,
      activeCwl: true,
      lastSuccessfulAt: new Date("2026-07-11T11:00:00.000Z"),
      latestStatus: "healthy",
      missingMigrations: [],
    })).toEqual({ status: "healthy", exitCode: 0 });
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
