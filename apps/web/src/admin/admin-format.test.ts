import { describe, expect, it } from "vitest";
import { formatInstant, formatLogTime, formatRelativeInstant, formatRunWindow } from "./admin-format.js";

/* Local-time constructors throughout, so the assertions hold in any zone the
   suite runs in: the formats are local by design. */
const now = new Date(2026, 8, 5, 12, 0);
const local = (y: number, m: number, d: number, h: number, min: number) => new Date(y, m, d, h, min).toISOString();

describe("admin time formats", () => {
  it("writes the log column as day, month and a 24-hour clock with no year in the current year", () => {
    expect(formatLogTime(local(2026, 8, 4, 21, 10), now)).toBe("4 Sep 21:10");
    expect(formatLogTime(local(2025, 11, 31, 9, 5), now)).toBe("31 Dec 2025 09:05");
  });

  it("states a run window with one date and two clocks", () => {
    expect(formatRunWindow(local(2026, 8, 5, 14, 1), local(2026, 8, 5, 14, 2), now)).toBe("5 Sep, 14:01 – 14:02");
    expect(formatRunWindow(local(2026, 8, 5, 14, 1), null, now)).toBe("5 Sep, 14:01, still running");
    expect(formatRunWindow(local(2026, 8, 5, 23, 58), local(2026, 8, 6, 0, 3), now)).toBe("5 Sep, 23:58 – 6 Sep, 00:03");
  });

  it("reads the next run relative to today for the two days a reader can place", () => {
    expect(formatRelativeInstant(local(2026, 8, 5, 15, 0), now)).toBe("today, 15:00");
    expect(formatRelativeInstant(local(2026, 8, 6, 14, 2), now)).toBe("tomorrow, 14:02");
    expect(formatRelativeInstant(local(2026, 8, 7, 14, 2), now)).toBe("7 Sep, 14:02");
    expect(formatInstant(local(2026, 8, 4, 14, 2), now)).toBe("4 Sep, 14:02");
  });
});
