import { describe, expect, it, vi } from "vitest";
import { ClashApiError } from "../src/clash-client.js";
import { collectOnce } from "../src/collect.js";
import type { RawSnapshot, RawSnapshotStore, SaveSnapshotInput } from "../src/raw-snapshots.js";

function rawSnapshot(input: SaveSnapshotInput): RawSnapshot {
  return {
    id: `snapshot-${input.collectionAttemptId}`,
    endpoint: input.endpoint,
    requestIdentity: input.requestIdentity,
    collectedAt: input.collectedAt,
    responseBody: input.responseBody,
  };
}

function makeStore() {
  const store: RawSnapshotStore = {
    createRun: vi.fn().mockResolvedValue("run-1"),
    createAttempt: vi.fn().mockImplementation(async (input) => `attempt-${input.endpoint}`),
    saveSnapshot: vi.fn().mockImplementation(async (input) => rawSnapshot(input)),
    finishAttempt: vi.fn().mockResolvedValue(undefined),
    finishRun: vi.fn().mockResolvedValue(undefined),
  };
  return store;
}

describe("collectOnce", () => {
  it("persists exact raw responses before collecting dependent endpoints", async () => {
    const events: string[] = [];
    const store = makeStore();
    const normalize = vi.fn().mockResolvedValue(undefined);
    vi.mocked(store.saveSnapshot).mockImplementation(async (input) => {
      const { endpoint, responseBody, contentSha256 } = input;
      events.push(`saved:${endpoint}`);
      if (endpoint === "clan") expect(responseBody).toBe(clan);
      if (endpoint === "league_group") expect(responseBody).toBe(leagueGroup);
      expect(contentSha256).toMatch(/^[0-9a-f]{64}$/);
      return { ...rawSnapshot(input), collectedAt: "2098-12-01T00:00:00.000Z" };
    });
    const clan = {
      tag: "#FAKECLAN",
      name: "Fixture Clan",
      memberList: [{ tag: "#FAKEONE", name: "Fixture One", townHallLevel: 16 }],
    };
    const leagueGroup = {
      state: "preparation",
      season: "2099-01",
      clans: [],
      rounds: [{ warTags: ["#FAKEWAR1", "#0"] }],
    };
    const client = {
      getClan: vi.fn(async () => clan),
      getMembers: vi.fn(async () => ({ items: clan.memberList })),
      getPlayer: vi.fn(async () => ({ tag: "#FAKEONE", name: "Fixture One", townHallLevel: 16 })),
      getLeagueGroup: vi.fn(async () => leagueGroup),
      getLeagueWar: vi.fn(async () => {
        expect(events).toContain("saved:league_group");
        return { tag: "#FAKEWAR1", state: "preparation", clan: {}, opponent: {} };
      }),
      getCurrentWar: vi.fn(async () => ({ state: "notInWar" })),
    };

    const summary = await collectOnce({
      client, store, clanTag: "#FAKECLAN", normalize,
      now: () => new Date("2099-01-02T12:00:00.000Z"),
    });

    expect(summary.capturedWarTags).toEqual(["#FAKEWAR1"]);
    expect(summary.failedEndpoints).toEqual([]);
    expect(summary.seasonId).toBe("2099-01");
    expect(summary.successfulEndpoints).toEqual([
      "clan", "members", "player", "current_war", "league_group", "league_war",
    ]);
    expect(store.createAttempt).toHaveBeenCalledTimes(6);
    expect(store.saveSnapshot).toHaveBeenCalledTimes(6);
    expect(normalize).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "members",
        collectedAt: "2099-01-02T12:00:00.000Z",
        responseBody: { items: clan.memberList },
      }),
      { clanTag: "#FAKECLAN", collectionRunId: "run-1" },
    );
  });

  it("continues sibling collection after a partial failure", async () => {
    const store = makeStore();
    const client = {
      getClan: vi.fn().mockRejectedValue(new ClashApiError(
        "rate_limited",
        "Rate limited",
        429,
        undefined,
        { reason: "rateLimitExceeded" },
      )),
      getMembers: vi.fn().mockResolvedValue({ items: [] }),
      getPlayer: vi.fn(),
      getLeagueGroup: vi.fn().mockResolvedValue({
        state: "notInWar",
        season: "2099-01",
        clans: [],
        rounds: [],
      }),
      getLeagueWar: vi.fn(),
      getCurrentWar: vi.fn(async () => ({ state: "notInWar" })),
    };

    const summary = await collectOnce({ client, store, clanTag: "#FAKECLAN" });

    expect(client.getMembers).toHaveBeenCalled();
    expect(client.getLeagueGroup).toHaveBeenCalled();
    expect(summary.successfulEndpoints).toEqual(["members", "current_war", "league_group"]);
    expect(summary.failedEndpoints).toEqual(["clan"]);
    expect(summary.errorCategories).toEqual({ clan: "rate_limited" });
    expect(summary.lastFreshAt).not.toBeNull();
    expect(store.saveSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      endpoint: "clan",
      httpStatus: 429,
      responseBody: { reason: "rateLimitExceeded" },
      contentSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    }));
    expect(store.finishRun).toHaveBeenCalledWith(expect.objectContaining({ status: "partial" }));
  });

  it("still captures raw snapshots when normalization is withheld", async () => {
    // The degraded mode the schema guard selects (#81): raw snapshots are the part
    // that cannot be backfilled, so they keep being captured while nothing canonical
    // is written against a schema that is missing a migration this image needs.
    const store = makeStore();
    const normalize = vi.fn();
    const client = {
      getClan: vi.fn().mockResolvedValue({ tag: "#FAKECLAN", name: "Fixture", memberList: [] }),
      getMembers: vi.fn().mockResolvedValue({ items: [] }),
      getPlayer: vi.fn(),
      getLeagueGroup: vi.fn().mockRejectedValue(new ClashApiError("not_found", "Not found", 404)),
      getLeagueWar: vi.fn(),
      getCurrentWar: vi.fn(async () => ({ state: "notInWar" })),
    };

    const summary = await collectOnce({ client, store, clanTag: "#FAKECLAN" });

    expect(normalize).not.toHaveBeenCalled();
    expect(store.saveSnapshot).toHaveBeenCalled();
    expect(summary.successfulEndpoints).toContain("members");
    expect(summary.internalErrors).toEqual([]);
    expect(store.finishRun).toHaveBeenCalledWith(expect.objectContaining({ activeCwl: false }));
  });

  it("reports unknown CWL activity when the league-group endpoint fails", async () => {
    const store = makeStore();
    const client = {
      getClan: vi.fn().mockResolvedValue({ tag: "#FAKECLAN", name: "Fixture", memberList: [] }),
      getMembers: vi.fn().mockResolvedValue({ items: [] }),
      getPlayer: vi.fn(),
      getLeagueGroup: vi.fn().mockRejectedValue(new ClashApiError("network", "Network failed")),
      getLeagueWar: vi.fn(),
      getCurrentWar: vi.fn(async () => ({ state: "notInWar" })),
    };

    const summary = await collectOnce({ client, store, clanTag: "#FAKECLAN", sleep: async () => {} });

    expect(summary.failedEndpoints).toContain("league_group");
    expect(summary.activeCwl).toBeNull();
    expect(store.finishRun).toHaveBeenCalledWith(expect.objectContaining({ activeCwl: null }));
  });

  it("confirms CWL is inactive when the league-group endpoint returns not found", async () => {
    const store = makeStore();
    const client = {
      getClan: vi.fn().mockResolvedValue({ tag: "#FAKECLAN", name: "Fixture", memberList: [] }),
      getMembers: vi.fn().mockResolvedValue({ items: [] }),
      getPlayer: vi.fn(),
      getLeagueGroup: vi.fn().mockRejectedValue(new ClashApiError("not_found", "Not found", 404)),
      getLeagueWar: vi.fn(),
      getCurrentWar: vi.fn(async () => ({ state: "preparation", endTime: "20260817T090405.000Z" })),
    };

    const summary = await collectOnce({ client, store, clanTag: "#FAKECLAN" });

    expect(summary.activeCwl).toBe(false);
    expect(summary.failedEndpoints).toContain("league_group");
    expect(summary.regularWar).toMatchObject({ state: "preparation" });
    expect(summary.seasonId).toBeNull();
    expect(store.finishRun).toHaveBeenCalledWith(expect.objectContaining({ activeCwl: false }));
  });

  it("continues siblings and reports storage failure when saving a snapshot fails", async () => {
    const store = makeStore();
    vi.mocked(store.saveSnapshot).mockRejectedValueOnce(new Error("database unavailable"));
    const client = {
      getClan: vi.fn().mockResolvedValue({ tag: "#FAKECLAN", name: "Fixture", memberList: [] }),
      getMembers: vi.fn().mockResolvedValue({ items: [] }),
      getPlayer: vi.fn(),
      getLeagueGroup: vi.fn().mockResolvedValue({
        state: "notInWar", season: "2099-01", clans: [], rounds: [],
      }),
      getLeagueWar: vi.fn(),
      getCurrentWar: vi.fn(async () => ({ state: "notInWar" })),
    };

    const summary = await collectOnce({ client, store, clanTag: "#FAKECLAN" });

    expect(client.getMembers).toHaveBeenCalled();
    expect(client.getLeagueGroup).toHaveBeenCalled();
    expect(summary.errorCategories.clan).toBe("storage_error");
    expect(summary.finalizationErrors).toEqual([]);
    expect(summary.successfulEndpoints).toEqual(["members", "current_war", "league_group"]);
    expect(store.saveSnapshot).toHaveBeenCalledTimes(4);
  });

  it("continues siblings and reports attempt finalization failure", async () => {
    const store = makeStore();
    vi.mocked(store.finishAttempt).mockRejectedValueOnce(new Error("attempt update failed"));
    const client = {
      getClan: vi.fn().mockResolvedValue({ tag: "#FAKECLAN", name: "Fixture", memberList: [] }),
      getMembers: vi.fn().mockResolvedValue({ items: [] }),
      getPlayer: vi.fn(),
      getLeagueGroup: vi.fn().mockResolvedValue({
        state: "notInWar", season: "2099-01", clans: [], rounds: [],
      }),
      getLeagueWar: vi.fn(),
    };

    const summary = await collectOnce({ client, store, clanTag: "#FAKECLAN" });

    expect(client.getLeagueGroup).toHaveBeenCalled();
    expect(summary.errorCategories.clan).toBe("storage_error");
    expect(summary.finalizationErrors).toEqual([expect.objectContaining({
      scope: "attempt",
      endpoint: "clan",
    })]);
    expect(summary.runFinalized).toBe(true);
    expect(store.saveSnapshot).toHaveBeenCalledTimes(3);
  });

  describe("transient Clash failures (#130)", () => {
    function rosterClient(getPlayer: ReturnType<typeof vi.fn>, getMembers?: ReturnType<typeof vi.fn>) {
      const memberList = [{ tag: "#FAKEONE", name: "Fixture One", townHallLevel: 16 }];
      return {
        getClan: vi.fn().mockResolvedValue({ tag: "#FAKECLAN", name: "Fixture", memberList }),
        getMembers: getMembers ?? vi.fn().mockResolvedValue({ items: memberList }),
        getPlayer,
        getLeagueGroup: vi.fn().mockResolvedValue({ state: "notInWar", season: "2099-01", clans: [], rounds: [] }),
        getLeagueWar: vi.fn(),
        getCurrentWar: vi.fn(async () => ({ state: "notInWar" })),
      };
    }
    const profile = { tag: "#FAKEONE", name: "Fixture One", townHallLevel: 16 };

    it("retries a timed-out request and judges the endpoint by its last try", async () => {
      const store = makeStore();
      const sleep = vi.fn(async (_ms: number) => {});
      const getPlayer = vi.fn()
        .mockRejectedValueOnce(new ClashApiError("timeout", "Clash request failed: timeout"))
        .mockResolvedValueOnce(profile);

      const summary = await collectOnce({ client: rosterClient(getPlayer), store, clanTag: "#FAKECLAN", sleep });

      expect(getPlayer).toHaveBeenCalledTimes(2);
      expect(summary.failedEndpoints).toEqual([]);
      expect(store.finishRun).toHaveBeenCalledWith(expect.objectContaining({ status: "healthy" }));
      const playerTries = vi.mocked(store.createAttempt).mock.calls
        .map(([input]) => input)
        .filter((input) => input.endpoint === "player");
      expect(playerTries.map((input) => input.attemptNumber)).toEqual([1, 2]);
      // The failed try stays on record as its own attempt.
      expect(store.finishAttempt).toHaveBeenCalledWith(expect.objectContaining({ status: "error", errorCategory: "timeout" }));
    });

    it("gives up after three tries and reports the last failure", async () => {
      const store = makeStore();
      const sleep = vi.fn(async (_ms: number) => {});
      const getPlayer = vi.fn().mockRejectedValue(new ClashApiError("network", "Clash request failed: network"));

      const summary = await collectOnce({ client: rosterClient(getPlayer), store, clanTag: "#FAKECLAN", sleep });

      expect(getPlayer).toHaveBeenCalledTimes(3);
      expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([1_000, 3_000]);
      expect(summary.failedEndpoints).toEqual(["player"]);
      expect(summary.errorCategories).toEqual({ player: "network" });
      expect(store.finishRun).toHaveBeenCalledWith(expect.objectContaining({ status: "partial" }));
    });

    it("still collects every profile when the member list times out once", async () => {
      const store = makeStore();
      const getMembers = vi.fn()
        .mockRejectedValueOnce(new ClashApiError("timeout", "Clash request failed: timeout"))
        .mockResolvedValueOnce({ items: [profile] });
      const getPlayer = vi.fn().mockResolvedValue(profile);

      const summary = await collectOnce({
        client: rosterClient(getPlayer, getMembers), store, clanTag: "#FAKECLAN", sleep: async () => {},
      });

      expect(getPlayer).toHaveBeenCalledTimes(1);
      expect(summary.failedEndpoints).toEqual([]);
    });

    it("does not retry an answer Clash actually gave", async () => {
      const store = makeStore();
      const sleep = vi.fn(async (_ms: number) => {});
      const getPlayer = vi.fn().mockRejectedValue(new ClashApiError("rate_limited", "Rate limited", 429));

      const summary = await collectOnce({ client: rosterClient(getPlayer), store, clanTag: "#FAKECLAN", sleep });

      expect(getPlayer).toHaveBeenCalledTimes(1);
      expect(sleep).not.toHaveBeenCalled();
      expect(summary.errorCategories).toEqual({ player: "rate_limited" });
    });
  });

  it("returns the original endpoint error and failed run finalization state", async () => {
    const store = makeStore();
    vi.mocked(store.finishRun).mockRejectedValue(new Error("run update failed"));
    const client = {
      getClan: vi.fn().mockRejectedValue(new ClashApiError("invalid_ip", "Invalid IP", 403)),
      getMembers: vi.fn().mockResolvedValue({ items: [] }),
      getPlayer: vi.fn(),
      getLeagueGroup: vi.fn().mockResolvedValue({
        state: "notInWar", season: "2099-01", clans: [], rounds: [],
      }),
      getLeagueWar: vi.fn(),
    };

    const summary = await collectOnce({ client, store, clanTag: "#FAKECLAN" });

    expect(summary.errorCategories.clan).toBe("invalid_ip");
    expect(store.finishRun).toHaveBeenCalledWith(expect.objectContaining({ status: "invalid_ip" }));
    expect(summary.runFinalized).toBe(false);
    expect(summary.finalizationErrors).toEqual([expect.objectContaining({
      scope: "run",
      message: "run update failed",
    })]);
  });
});
