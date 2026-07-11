import type { CollectionStatus } from "./raw-snapshots.js";

export const ACTIVE_CWL_INTERVAL_MS = 60 * 60 * 1_000;
export const IDLE_INTERVAL_MS = 24 * 60 * 60 * 1_000;

export interface CollectionLease {
  acquire(ownerId: string, expiresAt: Date): Promise<boolean>;
  release(ownerId: string): Promise<void>;
}

export interface CollectionResult { activeCwl: boolean }
type Timer = ReturnType<typeof setTimeout>;

export function nextCollectionAt(now: Date, activeCwl: boolean): Date {
  return new Date(now.getTime() + (activeCwl ? ACTIVE_CWL_INTERVAL_MS : IDLE_INTERVAL_MS));
}

export interface HealthInput {
  now: Date;
  activeCwl: boolean;
  lastSuccessfulAt: Date | null;
  latestStatus: CollectionStatus | null;
}

export type HealthStatus = "healthy" | "stale" | "invalid_ip" | "error";

export function evaluateHealth(input: HealthInput): { status: HealthStatus; exitCode: 0 | 1 } {
  if (input.latestStatus === "invalid_ip") return { status: "invalid_ip", exitCode: 1 };
  const interval = input.activeCwl ? ACTIVE_CWL_INTERVAL_MS : IDLE_INTERVAL_MS;
  if (!input.lastSuccessfulAt || input.now.getTime() - input.lastSuccessfulAt.getTime() > interval * 2) {
    return { status: "stale", exitCode: 1 };
  }
  if (input.latestStatus === "error") return { status: "error", exitCode: 1 };
  return { status: "healthy", exitCode: 0 };
}

interface SchedulerDependencies {
  collect: () => Promise<CollectionResult>;
  lease: CollectionLease;
  ownerId?: string;
  now?: () => Date;
  setTimer?: (callback: () => void, delay: number) => Timer;
  clearTimer?: (timer: Timer) => void;
  onError?: (error: unknown) => void;
}

export class CollectionScheduler {
  private readonly ownerId: string;
  private readonly now: () => Date;
  private readonly setTimer: (callback: () => void, delay: number) => Timer;
  private readonly clearTimer: (timer: Timer) => void;
  private timer: Timer | undefined;
  private running = false;
  private stopped = false;

  constructor(private readonly dependencies: SchedulerDependencies) {
    this.ownerId = dependencies.ownerId ?? crypto.randomUUID();
    this.now = dependencies.now ?? (() => new Date());
    this.setTimer = dependencies.setTimer ?? setTimeout;
    this.clearTimer = dependencies.clearTimer ?? clearTimeout;
  }

  async start(): Promise<void> {
    this.stopped = false;
    await this.runNow();
  }

  async runNow(): Promise<void> {
    if (this.running || this.stopped) return;
    this.running = true;
    let acquired = false;
    try {
      const leaseExpiry = new Date(this.now().getTime() + ACTIVE_CWL_INTERVAL_MS);
      acquired = await this.dependencies.lease.acquire(this.ownerId, leaseExpiry);
      if (!acquired) {
        // A standby must retry promptly: the active owner may stop before the next daily window.
        this.schedule(true);
        return;
      }
      const result = await this.dependencies.collect();
      this.schedule(result.activeCwl);
    } catch (error) {
      this.dependencies.onError?.(error);
      this.schedule(true);
    } finally {
      if (acquired) {
        try { await this.dependencies.lease.release(this.ownerId); }
        catch (error) { this.dependencies.onError?.(error); }
      }
      this.running = false;
    }
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer !== undefined) this.clearTimer(this.timer);
    this.timer = undefined;
  }

  private schedule(activeCwl: boolean): void {
    if (this.stopped) return;
    const delay = nextCollectionAt(this.now(), activeCwl).getTime() - this.now().getTime();
    this.timer = this.setTimer(() => { void this.runNow(); }, delay);
  }
}
