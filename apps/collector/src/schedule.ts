import type { CollectionStatus } from "./raw-snapshots.js";

export const ACTIVE_CWL_INTERVAL_MS = 60 * 60 * 1_000;
export const IDLE_INTERVAL_MS = 24 * 60 * 60 * 1_000;
export const REGULAR_WAR_INTERVAL_MS = 6 * 60 * 60 * 1_000;
export const REGULAR_WAR_FINALIZATION_LEAD_MS = 5 * 60 * 1_000;
export const REGULAR_WAR_FINALIZATION_DELAY_MS = 5 * 60 * 1_000;
export const LEASE_DURATION_MS = 60 * 60 * 1_000;
export const LEASE_HEARTBEAT_MS = 20 * 60 * 1_000;
export const LEASE_SAFETY_DEADLINE_MS = LEASE_DURATION_MS - LEASE_HEARTBEAT_MS;

export interface CollectionLease {
  acquire(ownerId: string, expiresAt: Date): Promise<boolean>;
  renew(ownerId: string, expiresAt: Date): Promise<boolean>;
  release(ownerId: string): Promise<void>;
}

export interface RegularWarCollectionState {
  state: string;
  endTime: string | null;
  warKey: string | null;
}

export interface CollectionResult {
  activeCwl: boolean | null;
  regularWar?: RegularWarCollectionState | null;
}
type Timer = ReturnType<typeof setTimeout>;

export interface CollectionCadence {
  activeCwlIntervalMs: number;
  idleIntervalMs: number;
  regularWarIntervalMs?: number;
  regularWarFinalizationLeadMs?: number;
  regularWarFinalizationDelayMs?: number;
}

const defaultCadence: CollectionCadence = {
  activeCwlIntervalMs: ACTIVE_CWL_INTERVAL_MS,
  idleIntervalMs: IDLE_INTERVAL_MS,
  regularWarIntervalMs: REGULAR_WAR_INTERVAL_MS,
  regularWarFinalizationLeadMs: REGULAR_WAR_FINALIZATION_LEAD_MS,
  regularWarFinalizationDelayMs: REGULAR_WAR_FINALIZATION_DELAY_MS,
};

export function nextCollectionAt(
  now: Date,
  activeCwl: boolean | null,
  cadence: CollectionCadence = defaultCadence,
  regularWar?: RegularWarCollectionState | null,
): Date {
  let delay = activeCwl === false ? cadence.idleIntervalMs : cadence.activeCwlIntervalMs;
  if (activeCwl === false && regularWar && (regularWar.state === "preparation" || regularWar.state === "inWar")) {
    delay = Math.min(delay, cadence.regularWarIntervalMs ?? REGULAR_WAR_INTERVAL_MS);
    const endTime = regularWar.endTime === null ? NaN : Date.parse(regularWar.endTime);
    if (Number.isFinite(endTime)) {
      const untilEnd = endTime - now.getTime();
      if (untilEnd > 0) {
        const lead = cadence.regularWarFinalizationLeadMs ?? REGULAR_WAR_FINALIZATION_LEAD_MS;
        if (untilEnd <= lead) {
          delay = Math.min(delay, Math.max(1_000, untilEnd));
        } else {
          delay = Math.min(delay, untilEnd - lead);
        }
      } else {
        delay = Math.min(delay, cadence.regularWarFinalizationDelayMs ?? REGULAR_WAR_FINALIZATION_DELAY_MS);
      }
    }
  }
  return new Date(now.getTime() + delay);
}

export interface HealthInput {
  now: Date;
  activeCwl: boolean;
  lastSuccessfulAt: Date | null;
  latestStatus: CollectionStatus | null;
  activeCwlIntervalMs?: number;
  idleIntervalMs?: number;
  regularWarIntervalMs?: number;
  regularWarFinalizationLeadMs?: number;
  regularWarFinalizationDelayMs?: number;
}

export type HealthStatus = "healthy" | "stale" | "invalid_ip" | "error";

export function evaluateHealth(input: HealthInput): { status: HealthStatus; exitCode: 0 | 1 } {
  if (input.latestStatus === "invalid_ip") return { status: "invalid_ip", exitCode: 1 };
  const interval = input.activeCwl
    ? (input.activeCwlIntervalMs ?? ACTIVE_CWL_INTERVAL_MS)
    : (input.idleIntervalMs ?? IDLE_INTERVAL_MS);
  if (!input.lastSuccessfulAt || input.now.getTime() - input.lastSuccessfulAt.getTime() > interval * 2) {
    return { status: "stale", exitCode: 1 };
  }
  if (input.latestStatus === "error") return { status: "error", exitCode: 1 };
  return { status: "healthy", exitCode: 0 };
}

interface SchedulerDependencies {
  collect: (signal: AbortSignal) => Promise<CollectionResult>;
  lease: CollectionLease;
  ownerId?: string;
  now?: () => Date;
  setTimer?: (callback: () => void, delay: number) => Timer;
  clearTimer?: (timer: Timer) => void;
  setHeartbeat?: (callback: () => void, delay: number) => Timer;
  clearHeartbeat?: (timer: Timer) => void;
  setWatchdog?: (callback: () => void, delay: number) => Timer;
  clearWatchdog?: (timer: Timer) => void;
  onError?: (error: unknown) => void;
  activeCwlIntervalMs?: number;
  idleIntervalMs?: number;
  regularWarIntervalMs?: number;
  regularWarFinalizationLeadMs?: number;
  regularWarFinalizationDelayMs?: number;
}

export class CollectionScheduler {
  private readonly ownerId: string;
  private readonly now: () => Date;
  private readonly setTimer: (callback: () => void, delay: number) => Timer;
  private readonly clearTimer: (timer: Timer) => void;
  private readonly setHeartbeat: (callback: () => void, delay: number) => Timer;
  private readonly clearHeartbeat: (timer: Timer) => void;
  private readonly setWatchdog: (callback: () => void, delay: number) => Timer;
  private readonly clearWatchdog: (timer: Timer) => void;
  private readonly cadence: CollectionCadence;
  private timer: Timer | undefined;
  private heartbeat: Timer | undefined;
  private watchdog: Timer | undefined;
  private running = false;
  private stopped = false;

  constructor(private readonly dependencies: SchedulerDependencies) {
    this.ownerId = dependencies.ownerId ?? crypto.randomUUID();
    this.now = dependencies.now ?? (() => new Date());
    this.setTimer = dependencies.setTimer ?? setTimeout;
    this.clearTimer = dependencies.clearTimer ?? clearTimeout;
    this.setHeartbeat = dependencies.setHeartbeat ?? setInterval;
    this.clearHeartbeat = dependencies.clearHeartbeat ?? clearInterval;
    this.setWatchdog = dependencies.setWatchdog ?? setTimeout;
    this.clearWatchdog = dependencies.clearWatchdog ?? clearTimeout;
    this.cadence = {
      activeCwlIntervalMs: dependencies.activeCwlIntervalMs ?? ACTIVE_CWL_INTERVAL_MS,
      idleIntervalMs: dependencies.idleIntervalMs ?? IDLE_INTERVAL_MS,
      regularWarIntervalMs: dependencies.regularWarIntervalMs ?? REGULAR_WAR_INTERVAL_MS,
      regularWarFinalizationLeadMs: dependencies.regularWarFinalizationLeadMs ?? REGULAR_WAR_FINALIZATION_LEAD_MS,
      regularWarFinalizationDelayMs: dependencies.regularWarFinalizationDelayMs ?? REGULAR_WAR_FINALIZATION_DELAY_MS,
    };
  }

  async start(): Promise<void> {
    this.stopped = false;
    await this.runNow();
  }

  async runNow(): Promise<void> {
    if (this.running || this.stopped) return;
    this.running = true;
    let acquired = false;
    let renewalInFlight: Promise<void> | undefined;
    const controller = new AbortController();
    try {
      const leaseExpiry = new Date(this.now().getTime() + LEASE_DURATION_MS);
      acquired = await this.dependencies.lease.acquire(this.ownerId, leaseExpiry);
      if (!acquired) {
        // A standby must retry promptly: the active owner may stop before the next daily window.
        this.schedule(true);
        return;
      }
      this.armWatchdog(controller);
      let renewing = false;
      this.heartbeat = this.setHeartbeat(() => {
        if (renewing || controller.signal.aborted) return;
        renewing = true;
        renewalInFlight = this.renewLease(controller).then(() => {
          this.armWatchdog(controller);
        }).finally(() => { renewing = false; });
      }, LEASE_HEARTBEAT_MS);
      const result = await this.dependencies.collect(controller.signal);
      if (renewalInFlight) await renewalInFlight;
      controller.signal.throwIfAborted();
      this.schedule(result.activeCwl, result.regularWar);
    } catch (error) {
      this.dependencies.onError?.(error);
      this.schedule(true);
    } finally {
      if (this.heartbeat !== undefined) this.clearHeartbeat(this.heartbeat);
      this.heartbeat = undefined;
      if (this.watchdog !== undefined) this.clearWatchdog(this.watchdog);
      this.watchdog = undefined;
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

  private async renewLease(controller: AbortController): Promise<void> {
    try {
      const renewed = await this.dependencies.lease.renew(
        this.ownerId,
        new Date(this.now().getTime() + LEASE_DURATION_MS),
      );
      if (!renewed) throw new Error("Collection lease ownership lost");
    } catch (error) {
      controller.abort(error instanceof Error ? error : new Error("Collection lease renewal failed"));
    }
  }

  private armWatchdog(controller: AbortController): void {
    if (this.watchdog !== undefined) this.clearWatchdog(this.watchdog);
    this.watchdog = this.setWatchdog(() => {
      controller.abort(new Error("Collection lease safety deadline exceeded"));
    }, LEASE_SAFETY_DEADLINE_MS);
  }

  private schedule(activeCwl: boolean | null, regularWar?: RegularWarCollectionState | null): void {
    if (this.stopped) return;
    const now = this.now();
    const delay = nextCollectionAt(now, activeCwl, this.cadence, regularWar).getTime() - now.getTime();
    this.timer = this.setTimer(() => { void this.runNow(); }, delay);
  }
}
