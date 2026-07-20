import { describe, expect, it } from "vitest";
import { normalizeSnapshot } from "../src/normalize.js";
import { fixtures, MemoryRepository } from "./normalization-fixture.js";

describe("normalizeSnapshot", () => {
  it("normalizes league group and war snapshots into canonical facts", async () => {
    const repository = new MemoryRepository();
    const { group, war } = fixtures();

    expect(await normalizeSnapshot(repository, group)).toMatchObject({ snapshotId: group.id, seasons: 1, members: 30 });
    expect(await normalizeSnapshot(repository, war)).toMatchObject({ snapshotId: war.id, wars: 1, warMembers: 30, attacks: 27 });
    expect(await repository.counts()).toEqual({ seasons: 1, wars: 1, warMembers: 30, attacks: 27 });
    expect(repository.normalized).toEqual(new Set([group.id, war.id]));
  });

  it("converges changed war state on the same canonical identities", async () => {
    const repository = new MemoryRepository();
    const initial = fixtures("inWar");
    const changed = fixtures("warEnded");
    await normalizeSnapshot(repository, initial.group);
    await normalizeSnapshot(repository, initial.war);
    await normalizeSnapshot(repository, changed.war);

    expect(await repository.counts()).toEqual({ seasons: 1, wars: 1, warMembers: 30, attacks: 27 });
    expect(repository.wars.get("#WAR")?.state).toBe("warEnded");
  });

  it("normalizes daily roster and player activity facts from the current collection context", async () => {
    const repository = new MemoryRepository();
    const context = { clanTag: "#CLAN", collectionRunId: "run-1" };
    const members = {
      id: "members-1",
      endpoint: "members",
      requestIdentity: "#CLAN",
      collectedAt: "2099-01-02T12:00:00.000Z",
      responseBody: { items: [{
        tag: "#ONE", name: "One", role: "elder", clanRank: 1, previousClanRank: 2,
        townHallLevel: 17, trophies: 5100, league: { id: 29000022, name: "Legend League" },
        donations: 400, donationsReceived: 200,
      }] },
    };
    const player = {
      id: "player-1",
      endpoint: "player",
      requestIdentity: "#ONE",
      collectedAt: "2099-01-02T12:00:30.000Z",
      responseBody: {
        tag: "#ONE", name: "One", townHallLevel: 17, warPreference: "in", warStars: 321,
        attackWins: 42, defenseWins: 3, clanCapitalContributions: 12345,
        achievements: [{ name: "Games Champion", value: 67890 }],
      },
    };

    await expect(normalizeSnapshot(repository, members, context)).resolves.toMatchObject({ rosterMembers: 1 });
    await expect(normalizeSnapshot(repository, player, context)).resolves.toMatchObject({ profiles: 1 });

    expect(repository.rosterObservations[0]).toEqual(expect.objectContaining({
      clanTag: "#CLAN", observedOn: "2099-01-02", collectionRunId: "run-1",
      members: [expect.objectContaining({ playerTag: "#ONE", donations: 400, leagueName: "Legend League" })],
    }));
    expect(repository.profiles[0]).toEqual(expect.objectContaining({
      playerTag: "#ONE", attackWins: 42, clanGamesPoints: 67890,
    }));
    expect(repository.normalized).toEqual(new Set(["members-1", "player-1"]));
  });
});
