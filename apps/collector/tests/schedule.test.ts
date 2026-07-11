import { describe, expect, it, vi } from "vitest";
import { CollectionScheduler, nextCollectionAt } from "../src/schedule.js";

describe("collector scheduling", () => {
  it("schedules hourly while CWL is active and daily otherwise", () => {
    const now = new Date("2026-07-11T12:00:00.000Z");
    expect(nextCollectionAt(now, true).toISOString()).toBe("2026-07-11T13:00:00.000Z");
    expect(nextCollectionAt(now, false).toISOString()).toBe("2026-07-12T12:00:00.000Z");
    expect(nextCollectionAt(now, null).toISOString()).toBe("2026-07-11T13:00:00.000Z");
  });

  it("renews ownership throughout a collection longer than the initial lease", async () => {
    let now = new Date("2026-07-11T12:00:00.000Z");
    let heartbeat!: () => void;
    let owner: string | undefined;
    let expiresAt = 0;
    const lease = {
      acquire: vi.fn(async (candidate: string, expiry: Date) => {
        if (owner && expiresAt > now.getTime() && owner !== candidate) return false;
        owner = candidate;
        expiresAt = expiry.getTime();
        return true;
      }),
      renew: vi.fn(async (candidate: string, expiry: Date) => {
        if (owner !== candidate || expiresAt <= now.getTime()) return false;
        expiresAt = expiry.getTime();
        return true;
      }),
      release: vi.fn(async (candidate: string) => { if (owner === candidate) owner = undefined; }),
    };
    let finish!: () => void;
    const scheduler = new CollectionScheduler({
      ownerId: "00000000-0000-4000-8000-000000000001",
      now: () => now,
      lease,
      collect: () => new Promise((resolve) => { finish = () => resolve({ activeCwl: true }); }),
      setHeartbeat: (callback) => { heartbeat = callback; return 2; },
      clearHeartbeat: vi.fn(),
      setTimer: () => 1,
      clearTimer: vi.fn(),
    });

    const run = scheduler.runNow();
    await vi.waitFor(() => expect(lease.acquire).toHaveBeenCalledOnce());
    now = new Date("2026-07-11T12:40:00.000Z");
    heartbeat();
    await vi.waitFor(() => expect(lease.renew).toHaveBeenCalledOnce());
    now = new Date("2026-07-11T13:01:00.000Z");
    expect(await lease.acquire("00000000-0000-4000-8000-000000000002", new Date("2026-07-11T14:01:00.000Z"))).toBe(false);
    finish();
    await run;
  });

  it("aborts and reports when lease renewal loses ownership", async () => {
    let heartbeat!: () => void;
    const onError = vi.fn();
    const lease = {
      acquire: vi.fn().mockResolvedValue(true),
      renew: vi.fn().mockResolvedValue(false),
      release: vi.fn().mockResolvedValue(undefined),
    };
    const scheduler = new CollectionScheduler({
      lease,
      collect: (signal) => new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      }),
      setHeartbeat: (callback) => { heartbeat = callback; return 2; },
      clearHeartbeat: vi.fn(),
      setTimer: () => 1,
      clearTimer: vi.fn(),
      onError,
    });

    const run = scheduler.runNow();
    await vi.waitFor(() => expect(lease.acquire).toHaveBeenCalledOnce());
    heartbeat();
    await run;

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "Collection lease ownership lost" }));
    expect(lease.release).toHaveBeenCalledOnce();
  });

  it("collects immediately and schedules from the current CWL state", async () => {
    const scheduled: Array<{ delay: number; callback: () => void }> = [];
    const collect = vi.fn().mockResolvedValue({ activeCwl: true });
    const scheduler = new CollectionScheduler({
      collect,
      lease: {
        acquire: vi.fn().mockResolvedValue(true),
        renew: vi.fn().mockResolvedValue(true),
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

  it("retries hourly when league-group activity is unknown", async () => {
    const scheduled: number[] = [];
    const scheduler = new CollectionScheduler({
      collect: vi.fn().mockResolvedValue({ activeCwl: null }),
      lease: {
        acquire: vi.fn().mockResolvedValue(true),
        renew: vi.fn().mockResolvedValue(true),
        release: vi.fn().mockResolvedValue(undefined),
      },
      now: () => new Date("2026-07-11T12:00:00.000Z"),
      setTimer: (_callback, delay) => { scheduled.push(delay); return 1; },
      clearTimer: vi.fn(),
    });

    await scheduler.start();

    expect(scheduled).toEqual([60 * 60 * 1_000]);
  });

  it("prevents overlap in-process and with a database lease", async () => {
    let finish!: () => void;
    const collect = vi.fn(() => new Promise<{ activeCwl: boolean }>((resolve) => {
      finish = () => resolve({ activeCwl: false });
    }));
    const lease = {
      acquire: vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false),
      renew: vi.fn().mockResolvedValue(true),
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
