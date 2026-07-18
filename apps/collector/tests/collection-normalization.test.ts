import { describe, expect, it } from "vitest";
import type { SeasonRecord } from "../../../packages/database/src/repository.js";
import { collectOnce } from "../src/collect.js";
import type { RawSnapshot, SaveSnapshotInput } from "../src/raw-snapshots.js";
import { normalizeSnapshot } from "../src/normalize.js";
import { fixtures, MemoryRepository } from "./normalization-fixture.js";

class CollectionRepository extends MemoryRepository {
  readonly events: string[] = [];
  readonly snapshots = new Map<string, RawSnapshot>();
  readonly attempts: Array<{ status?: string; errorCategory?: string }> = [];
  runStatus?: string;

  async createRun() { return "run-1"; }
  async createAttempt() {
    this.attempts.push({});
    return `attempt-${this.attempts.length}`;
  }
  async saveSnapshot(input: SaveSnapshotInput): Promise<any> {
    const key = `${input.endpoint}:${input.requestIdentity}:${input.contentSha256}`;
    const existing = this.snapshots.get(key);
    if (existing) return existing;
    const snapshot: RawSnapshot = {
      id: `snapshot-${this.snapshots.size + 1}`,
      endpoint: input.endpoint,
      requestIdentity: input.requestIdentity,
      collectedAt: input.collectedAt,
      responseBody: input.responseBody,
    };
    this.snapshots.set(key, snapshot);
    this.events.push(`saved:${input.endpoint}`);
    return snapshot;
  }
  async finishAttempt(input: { attemptId: string; status: string; errorCategory?: string }) {
    this.attempts[Number(input.attemptId.split("-")[1]) - 1] = {
      status: input.status,
      ...(input.errorCategory === undefined ? {} : { errorCategory: input.errorCategory }),
    };
  }
  async finishRun(input: { status: string }) { this.runStatus = input.status; }
  override async upsertSeason(value: SeasonRecord) {
    this.events.push("normalized:league_group");
    await super.upsertSeason(value);
  }
}

function fixtureClient() {
  const { group, war } = fixtures();
  return {
    getClan: async () => ({ tag: "#CLAN", name: "Fixture Clan", memberList: [] }),
    getMembers: async () => ({ items: [] }),
    getPlayer: async () => ({ tag: "#PLAYER", name: "Fixture Player", townHallLevel: 1 }),
    getLeagueGroup: async () => group.responseBody as any,
    getLeagueWar: async () => war.responseBody as any,
  };
}

describe("collection normalization composition", () => {
  it("persists successful snapshots before creating canonical CWL facts", async () => {
    const repository = new CollectionRepository();
    const dependencies = {
      client: fixtureClient(),
      store: repository,
      clanTag: "#CLAN",
      normalize: (snapshot: RawSnapshot) => normalizeSnapshot(repository, snapshot),
    };

    const summary = await collectOnce(dependencies);

    expect(repository.events.indexOf("saved:league_group"))
      .toBeLessThan(repository.events.indexOf("normalized:league_group"));
    expect(await repository.counts()).toEqual({ seasons: 1, wars: 1, warMembers: 30, attacks: 27 });
    expect(summary.failedEndpoints).toEqual([]);
  });

  it("reports normalization failure as non-healthy and skips dependent war collection", async () => {
    const repository = new CollectionRepository();
    const dependencies = {
      client: fixtureClient(),
      store: repository,
      clanTag: "#CLAN",
      normalize: async (snapshot: RawSnapshot) => {
        if (snapshot.endpoint === "league_group") throw new Error("invalid CWL group");
        return normalizeSnapshot(repository, snapshot);
      },
    };

    const summary = await collectOnce(dependencies);

    expect(summary.errorCategories.league_group).toBe("normalization_error");
    expect(summary.internalErrors).toContainEqual({
      endpoint: "league_group",
      operation: "normalize_snapshot",
      message: "invalid CWL group",
    });
    expect(repository.runStatus).toBe("partial");
    expect([...repository.snapshots.values()].map(snapshot => snapshot.endpoint)).not.toContain("league_war");
  });
});
