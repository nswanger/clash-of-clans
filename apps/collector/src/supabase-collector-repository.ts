import { buildSupabaseRequestHeaders } from "./supabase-auth.js";
import type {
  CreateAttemptInput,
  FinishAttemptInput,
  FinishRunInput,
  RawSnapshot,
  RawSnapshotStore,
  SaveSnapshotInput,
} from "./raw-snapshots.js";
import type { CollectionLease } from "./schedule.js";
import type {
  AttackRecord,
  CanonicalRepository,
  MemberRecord,
  SeasonRecord,
  WarMemberRecord,
  WarRecord,
  WarUnit,
} from "./normalize.js";

interface RestOptions { method?: string; body?: unknown; prefer?: string }
interface RawSnapshotRow {
  id: string;
  endpoint: string;
  request_identity: string;
  collected_at: string;
  response_body: unknown;
}

export class SupabaseCollectorRepository implements RawSnapshotStore, CanonicalRepository, CollectionLease {
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

  async saveSnapshot(input: SaveSnapshotInput): Promise<RawSnapshot> {
    const inserted = await this.rest<RawSnapshotRow[]>(
      "raw_snapshots?on_conflict=endpoint,request_identity,content_sha256",
      {
      method: "POST",
      body: {
        collection_attempt_id: input.collectionAttemptId, endpoint: input.endpoint,
        request_identity: input.requestIdentity, collected_at: input.collectedAt,
        http_status: input.httpStatus, content_sha256: input.contentSha256,
        response_body: input.responseBody,
      },
      prefer: "resolution=ignore-duplicates,return=representation",
      },
    );
    const rows = inserted.length > 0 ? inserted : await this.rest<RawSnapshotRow[]>(
      `raw_snapshots?select=id,endpoint,request_identity,collected_at,response_body`
      + `&endpoint=eq.${encodeURIComponent(input.endpoint)}`
      + `&request_identity=eq.${encodeURIComponent(input.requestIdentity)}`
      + `&content_sha256=eq.${input.contentSha256}&limit=1`,
    );
    const row = rows[0];
    if (!row) throw new Error("Persisted raw snapshot could not be resolved");
    return {
      id: row.id,
      endpoint: row.endpoint,
      requestIdentity: row.request_identity,
      collectedAt: row.collected_at,
      responseBody: row.response_body,
    };
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

  async upsertSeason(value: SeasonRecord): Promise<void> {
    await this.upsert("cwl_seasons", value, "clan_tag,season_id");
  }

  async upsertMember(value: MemberRecord): Promise<void> {
    await this.upsert("cwl_members", value, "clan_tag,season_id,player_tag");
  }

  async upsertWar(value: WarRecord): Promise<void> {
    await this.upsert("cwl_wars", value, "war_tag");
  }

  async upsertWarMember(value: WarMemberRecord): Promise<void> {
    await this.upsert("cwl_war_members", value, "war_tag,player_tag");
  }

  async upsertAttack(value: AttackRecord): Promise<void> {
    await this.upsert("cwl_attacks", value, "war_tag,attacker_tag,attack_order");
  }

  async applyWarUnit(unit: WarUnit): Promise<void> {
    await this.rpc("apply_cwl_war_unit", {
      p_war: snake(unit.war),
      p_members: unit.members.map(snake),
      p_attacks: unit.attacks.map(snake),
    });
  }

  async findWarContext(warTag: string) {
    const rows = await this.rest<Array<{ clan_tag: string; season_id: string; war_day: number }>>(
      "cwl_wars?select=clan_tag,season_id,war_day"
      + `&war_tag=eq.${encodeURIComponent(warTag)}&limit=1`,
    );
    const row = rows[0];
    return row
      ? { clanTag: row.clan_tag, seasonId: row.season_id, warDay: row.war_day }
      : undefined;
  }

  async markSnapshotNormalized(snapshotId: string, normalizedAt: string): Promise<void> {
    await this.rest(`raw_snapshots?id=eq.${encodeURIComponent(snapshotId)}`, {
      method: "PATCH",
      body: { normalized_at: normalizedAt },
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

  async renew(ownerId: string, expiresAt: Date): Promise<boolean> {
    return this.rpc<boolean>("renew_collector_lease", {
      p_lease_name: "cwl-collector", p_owner_id: ownerId, p_expires_at: expiresAt.toISOString(),
    });
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

  private async upsert(table: string, value: object, onConflict: string): Promise<void> {
    await this.rest(`${table}?on_conflict=${onConflict}`, {
      method: "POST",
      body: snake(value),
      prefer: "resolution=merge-duplicates,return=minimal",
    });
  }

  private async rest<T = unknown>(path: string, options: RestOptions = {}): Promise<T> {
    const response = await fetch(`${this.url}/rest/v1/${path}`, {
      method: options.method ?? "GET",
      headers: buildSupabaseRequestHeaders(this.key, options.prefer),
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

function snake(value: object): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`), item]),
  );
}
