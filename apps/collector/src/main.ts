import { ClashClient } from "./clash-client.js";
import { collectOnce } from "./collect.js";
import { loadConfig } from "./config.js";
import type {
  CreateAttemptInput,
  FinishAttemptInput,
  FinishRunInput,
  RawSnapshotStore,
  SaveSnapshotInput,
} from "./raw-snapshots.js";
import { CollectionScheduler, evaluateHealth, type CollectionLease } from "./schedule.js";

declare const process: {
  argv: string[];
  env: Record<string, string | undefined>;
  exitCode?: number;
  on(signal: string, handler: () => void): void;
};

interface RestOptions { method?: string; body?: unknown; prefer?: string }

class SupabaseCollectorRepository implements RawSnapshotStore, CollectionLease {
  constructor(private readonly url: string, private readonly key: string) {}

  async createRun(input: { startedAt: string }): Promise<string> {
    const rows = await this.rest<Array<{ id: string }>>("collection_runs", {
      method: "POST", body: { started_at: input.startedAt }, prefer: "return=representation",
    });
    return requiredId(rows);
  }

  async createAttempt(input: CreateAttemptInput): Promise<string> {
    const rows = await this.rest<Array<{ id: string }>>("collection_attempts", {
      method: "POST",
      body: {
        run_id: input.runId, endpoint: input.endpoint, request_identity: input.requestIdentity,
        started_at: input.startedAt, status: "running",
      },
      prefer: "return=representation",
    });
    return requiredId(rows);
  }

  async saveSnapshot(input: SaveSnapshotInput): Promise<void> {
    await this.rest("raw_snapshots?on_conflict=endpoint,request_identity,content_sha256", {
      method: "POST",
      body: {
        collection_attempt_id: input.collectionAttemptId, endpoint: input.endpoint,
        request_identity: input.requestIdentity, collected_at: input.collectedAt,
        http_status: input.httpStatus, content_sha256: input.contentSha256,
        response_body: input.responseBody,
      },
      prefer: "resolution=ignore-duplicates,return=minimal",
    });
  }

  async finishAttempt(input: FinishAttemptInput): Promise<void> {
    await this.rest(`collection_attempts?id=eq.${encodeURIComponent(input.attemptId)}`, {
      method: "PATCH",
      body: {
        status: input.status, http_status: input.httpStatus, finished_at: input.finishedAt,
        error_category: input.errorCategory,
      },
    });
  }

  async finishRun(input: FinishRunInput): Promise<void> {
    await this.rest(`collection_runs?id=eq.${encodeURIComponent(input.runId)}`, {
      method: "PATCH",
      body: {
        status: input.status, finished_at: input.finishedAt,
        last_fresh_at: input.lastFreshAt, error_message: input.errorMessage,
      },
    });
  }

  async acquire(ownerId: string, expiresAt: Date): Promise<boolean> {
    return this.rpc<boolean>("acquire_collector_lease", {
      p_lease_name: "cwl-collector", p_owner_id: ownerId, p_expires_at: expiresAt.toISOString(),
    });
  }

  async release(ownerId: string): Promise<void> {
    await this.rpc("release_collector_lease", { p_lease_name: "cwl-collector", p_owner_id: ownerId });
  }

  async healthInput(now: Date) {
    const runs = await this.rest<Array<{
      status: "running" | "healthy" | "partial" | "invalid_ip" | "error";
      last_fresh_at: string | null;
    }>>("collection_runs?select=status,last_fresh_at&status=neq.running&order=started_at.desc&limit=1");
    const groups = await this.rest<Array<{ response_body: { state?: string } }>>(
      "raw_snapshots?select=response_body&endpoint=eq.league_group&http_status=eq.200&order=collected_at.desc&limit=1",
    );
    const latest = runs[0];
    return {
      now,
      activeCwl: groups[0]?.response_body.state !== undefined && groups[0].response_body.state !== "notInWar",
      lastSuccessfulAt: latest?.last_fresh_at ? new Date(latest.last_fresh_at) : null,
      latestStatus: latest?.status ?? null,
    };
  }

  private rpc<T = unknown>(name: string, body: Record<string, unknown>): Promise<T> {
    return this.rest<T>(`rpc/${name}`, { method: "POST", body });
  }

  private async rest<T = unknown>(path: string, options: RestOptions = {}): Promise<T> {
    const response = await fetch(`${this.url}/rest/v1/${path}`, {
      method: options.method ?? "GET",
      headers: {
        apikey: this.key,
        authorization: `Bearer ${this.key}`,
        "content-type": "application/json",
        ...(options.prefer ? { prefer: options.prefer } : {}),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
    if (!response.ok) throw new Error(`Supabase request failed (${response.status})`);
    if (response.status === 204 || response.headers.get("content-length") === "0") return undefined as T;
    return response.json() as Promise<T>;
  }
}

function requiredId(rows: Array<{ id: string }>): string {
  const id = rows[0]?.id;
  if (!id) throw new Error("Supabase insert did not return an id");
  return id;
}

async function main(): Promise<void> {
  const config = loadConfig(process.env);
  const repository = new SupabaseCollectorRepository(config.supabaseUrl, config.supabaseServiceRoleKey);
  if (process.argv.includes("--healthcheck")) {
    const result = evaluateHealth(await repository.healthInput(new Date()));
    console.log(JSON.stringify({ status: result.status }));
    process.exitCode = result.exitCode;
    return;
  }

  const client = new ClashClient({ token: config.clashApiToken });
  const scheduler = new CollectionScheduler({
    lease: repository,
    collect: () => collectOnce({ client, store: repository, clanTag: config.clanTag }),
    onError: (error) => console.error(error instanceof Error ? error.message : "Collector failed"),
  });
  const shutdown = () => { void scheduler.stop(); };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
  await scheduler.start();
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Collector failed to start");
  process.exitCode = 1;
});
