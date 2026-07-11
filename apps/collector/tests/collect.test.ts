import { describe, expect, it, vi } from "vitest";
import { ClashApiError } from "../src/clash-client.js";
import { collectOnce } from "../src/collect.js";
import type { RawSnapshotStore } from "../src/raw-snapshots.js";

function makeStore() {
  const store: RawSnapshotStore = {
    createRun: vi.fn().mockResolvedValue("run-1"),
    createAttempt: vi.fn().mockImplementation(async (input) => `attempt-${input.endpoint}`),
    saveSnapshot: vi.fn().mockResolvedValue(undefined),
    finishAttempt: vi.fn().mockResolvedValue(undefined),
    finishRun: vi.fn().mockResolvedValue(undefined),
  };
  return store;
}

describe("collectOnce", () => {
  it("persists exact raw responses before collecting dependent endpoints", async () => {
    const events: string[] = [];
    const store = makeStore();
    vi.mocked(store.saveSnapshot).mockImplementation(async ({ endpoint, responseBody, contentSha256 }) => {
      events.push(`saved:${endpoint}`);
      if (endpoint === "clan") expect(responseBody).toBe(clan);
      if (endpoint === "league_group") expect(responseBody).toBe(leagueGroup);
      expect(contentSha256).toMatch(/^[0-9a-f]{64}$/);
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
    };

    const summary = await collectOnce({ client, store, clanTag: "#FAKECLAN" });

    expect(summary.capturedWarTags).toEqual(["#FAKEWAR1"]);
    expect(summary.failedEndpoints).toEqual([]);
    expect(summary.successfulEndpoints).toEqual([
      "clan", "members", "player", "league_group", "league_war",
    ]);
    expect(store.createAttempt).toHaveBeenCalledTimes(5);
    expect(store.saveSnapshot).toHaveBeenCalledTimes(5);
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
    };

    const summary = await collectOnce({ client, store, clanTag: "#FAKECLAN" });

    expect(client.getMembers).toHaveBeenCalled();
    expect(client.getLeagueGroup).toHaveBeenCalled();
    expect(summary.successfulEndpoints).toEqual(["members", "league_group"]);
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
});
