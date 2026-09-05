import type { CollectionStatus } from "./raw-snapshots.js";

export const ACTIVE_CWL_INTERVAL_MS = 60 * 60 * 1_000;
export const IDLE_INTERVAL_MS = 24 * 60 * 60 * 1_000;
export const REGULAR_WAR_INTERVAL_MS = 6 * 60 * 60 * 1_000;
export const REGULAR_WAR_FINALIZATION_LEAD_MS = 5 * 60 * 1_000;
export const REGULAR_WAR_FINALIZATION_DELAY_MS = 5 * 60 * 1_000;
/**
 * Days at the start of a month during which a clan that has not yet been seen in the
 * month's CWL season is polled at the active cadence instead of the idle one (#104).
 * Sign-up opens on the 1st and war days finish around the 10th, so a season this
 * collector has not observed by then is one the clan skipped.
 */
export const SEASON_SIGNUP_WINDOW_DAYS = 10;
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
  /** The `collection_runs` row this run wrote, when it reached the store (#117). */
  runId?: string;
  activeCwl: boolean | null;
  regularWar?: RegularWarCollectionState | null;
  /** The CWL season (`YYYY-MM`) the league group reported this run, when there was one. */
  seasonId?: string | null;
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

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * True when the calendar month has a CWL season this collector has not yet observed and
 * the sign-up window is still open. An unknown latest season (a fresh process) counts as
 * not observed: waiting a day on missing evidence is what left day 1 empty (#104).
 */
export function inSeasonSignupWindow(now: Date, latestSeasonId: string | null | undefined): boolean {
  if (now.getUTCDate() > SEASON_SIGNUP_WINDOW_DAYS) return false;
  return !latestSeasonId || latestSeasonId < monthKey(now);
}

export function nextCollectionAt(
  now: Date,
  activeCwl: boolean | null,
  cadence: CollectionCadence = defaultCadence,
  regularWar?: RegularWarCollectionState | null,
  latestSeasonId?: string | null,
): Date {
  let delay = activeCwl === false ? cadence.idleIntervalMs : cadence.activeCwlIntervalMs;
  if (activeCwl === false && inSeasonSignupWindow(now, latestSeasonId)) {
    delay = Math.min(delay, cadence.activeCwlIntervalMs);
  }
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
  /** Migrations this image needs that the database has not applied (#81). */
  missingMigrations?: readonly string[];
}

export type HealthStatus = "healthy" | "schema_behind" | "stale" | "invalid_ip" | "error";

export function evaluateHealth(input: HealthInput): { status: HealthStatus; exitCode: 0 | 1 } {
  // Reported ahead of everything else: a collector whose database is missing a
  // migration it needs is not recording canonical data, and every other state would
  // describe that as an ordinary collection fault (#81).
  if (input.missingMigrations && input.missingMigrations.length > 0) {
    return { status: "schema_behind", exitCode: 1 };
  }
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
  /**
   * Writes `collection_runs.next_run_at` for the run that just finished (#117). The
   * scheduler computes the next run once and hands the same instant here and to the
   * timer, so the board and the process cannot disagree. A run that threw never
   * reaches this: its row keeps a null, and the retry path schedules on its own.
   */
  recordNextRun?: (runId: string, nextRunAt: Date) => Promise<void>;
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
  /** Most recent CWL season a run reported; null until one is seen in this process. */
  private latestSeasonId: string | null = null;

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
      if (result.seasonId) this.latestSeasonId = result.seasonId;
      const nextRunAt = this.schedule(result.activeCwl, result.regularWar);
      if (nextRunAt && result.runId && this.dependencies.recordNextRun) {
        // Best effort: a failure to record the instant must not cost the run its
        // status or its timer, so it is reported and the process carries on.
        try { await this.dependencies.recordNextRun(result.runId, nextRunAt); }
        catch (error) { this.dependencies.onError?.(error); }
      }
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

  /** Arms the timer and returns the instant it was armed for, or undefined once stopped. */
  private schedule(activeCwl: boolean | null, regularWar?: RegularWarCollectionState | null): Date | undefined {
    if (this.stopped) return undefined;
    const now = this.now();
    const nextRunAt = nextCollectionAt(now, activeCwl, this.cadence, regularWar, this.latestSeasonId);
    this.timer = this.setTimer(() => { void this.runNow(); }, nextRunAt.getTime() - now.getTime());
    return nextRunAt;
  }
}
