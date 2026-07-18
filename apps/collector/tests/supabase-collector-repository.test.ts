import { afterEach, describe, expect, it, vi } from "vitest";
import { SupabaseCollectorRepository } from "../src/supabase-collector-repository.js";
import type { SaveSnapshotInput } from "../src/raw-snapshots.js";

const snapshotInput: SaveSnapshotInput = {
  collectionAttemptId: "attempt-1",
  endpoint: "league_group",
  requestIdentity: "#CLAN",
  collectedAt: "2099-01-01T00:00:00.000Z",
  httpStatus: 200,
  contentSha256: "a".repeat(64),
  responseBody: { season: "2099-01" },
};

const persistedSnapshot = {
  id: "snapshot-stable",
  endpoint: "league_group",
  request_identity: "#CLAN",
  collected_at: "2099-01-01T00:00:00.000Z",
  response_body: { season: "2099-01" },
};

afterEach(() => vi.unstubAllGlobals());

describe("SupabaseCollectorRepository", () => {
  it("returns one stable raw snapshot identity when duplicate content is retried", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse([persistedSnapshot], 201))
      .mockResolvedValueOnce(jsonResponse([], 201))
      .mockResolvedValueOnce(jsonResponse([persistedSnapshot]));
    vi.stubGlobal("fetch", fetchMock);
    const repository = new SupabaseCollectorRepository("https://example.supabase.co", "sb_secret_test");

    const first = await repository.saveSnapshot(snapshotInput);
    const retried = await repository.saveSnapshot({ ...snapshotInput, collectionAttemptId: "attempt-2" });

    expect(first).toBeDefined();
    expect(first?.id).toBe("snapshot-stable");
    expect(retried).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0]?.[0]).toContain(
      "raw_snapshots?on_conflict=endpoint,request_identity,content_sha256",
    );
    expect(fetchMock.mock.calls[2]?.[0]).toContain("request_identity=eq.%23CLAN");
    for (const [, options] of fetchMock.mock.calls) {
      expect(options.headers.authorization).toBeUndefined();
    }
  });

  it("provides canonical operations and applies each war unit through the atomic RPC", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(undefined, 204));
    vi.stubGlobal("fetch", fetchMock);
    const repository = new SupabaseCollectorRepository("https://example.supabase.co", "sb_secret_test");

    expect(repository).toEqual(expect.objectContaining({
      upsertSeason: expect.any(Function),
      upsertMember: expect.any(Function),
      upsertWar: expect.any(Function),
      applyWarUnit: expect.any(Function),
      findWarContext: expect.any(Function),
      markSnapshotNormalized: expect.any(Function),
    }));
    await repository.applyWarUnit({
      war: {
        warTag: "#WAR", clanTag: "#CLAN", seasonId: "2099-01", warDay: 1,
        state: "inWar", attacksPerMember: 1,
      },
      members: [{ warTag: "#WAR", playerTag: "#ONE", mapPosition: 1, assignedAttacks: 1 }],
      attacks: [{
        warTag: "#WAR", attackerTag: "#ONE", attackOrder: 1,
        stars: 3, destruction: 100, recordedAt: "2099-01-02T00:00:00.000Z",
      }],
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://example.supabase.co/rest/v1/rpc/apply_cwl_war_unit",
    );
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1].body)).toEqual(expect.objectContaining({
      p_war: expect.objectContaining({ war_tag: "#WAR", clan_tag: "#CLAN" }),
      p_members: [expect.objectContaining({ player_tag: "#ONE" })],
      p_attacks: [expect.objectContaining({ attacker_tag: "#ONE" })],
    }));
    expect(fetchMock.mock.calls[0]?.[1].headers.authorization).toBeUndefined();
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
