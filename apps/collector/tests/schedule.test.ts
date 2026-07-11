import { describe, expect, it, vi } from "vitest";
import { CollectionScheduler, nextCollectionAt } from "../src/schedule.js";

describe("collector scheduling", () => {
  it("schedules hourly while CWL is active and daily otherwise", () => {
    const now = new Date("2026-07-11T12:00:00.000Z");
    expect(nextCollectionAt(now, true).toISOString()).toBe("2026-07-11T13:00:00.000Z");
    expect(nextCollectionAt(now, false).toISOString()).toBe("2026-07-12T12:00:00.000Z");
  });

  it("collects immediately and schedules from the current CWL state", async () => {
    const scheduled: Array<{ delay: number; callback: () => void }> = [];
    const collect = vi.fn().mockResolvedValue({ activeCwl: true });
    const scheduler = new CollectionScheduler({
      collect,
      lease: {
        acquire: vi.fn().mockResolvedValue(true),
        release: vi.fn().mockResolvedValue(undefined),
      },
      now: () => new Date("2026-07-11T12:00:00.000Z"),
      setTimer: (callback, delay) => {
        scheduled.push({ callback, delay });
        return 1;
      },
      clearTimer: vi.fn(),
    });

    await scheduler.start();

    expect(collect).toHaveBeenCalledTimes(1);
    expect(scheduled[0]?.delay).toBe(60 * 60 * 1_000);
  });

  it("prevents overlap in-process and with a database lease", async () => {
    let finish!: () => void;
    const collect = vi.fn(() => new Promise<{ activeCwl: boolean }>((resolve) => {
      finish = () => resolve({ activeCwl: false });
    }));
    const lease = {
      acquire: vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false),
      release: vi.fn().mockResolvedValue(undefined),
    };
    const scheduler = new CollectionScheduler({
      collect,
      lease,
      setTimer: () => 1,
      clearTimer: vi.fn(),
    });

    const first = scheduler.runNow();
    await scheduler.runNow();
    expect(collect).toHaveBeenCalledTimes(1);
    expect(lease.acquire).toHaveBeenCalledTimes(1);
    finish();
    await first;
    await scheduler.runNow();
    expect(collect).toHaveBeenCalledTimes(1);
    expect(lease.acquire).toHaveBeenCalledTimes(2);
  });
});
