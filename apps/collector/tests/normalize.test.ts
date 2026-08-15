import { describe, expect, it } from "vitest";
import { normalizeSnapshot } from "../src/normalize.js";
import type { RawSnapshot } from "../src/raw-snapshots.js";
import { fixtures, MemoryRepository } from "./normalization-fixture.js";

describe("normalizeSnapshot", () => {
  const warContext = { clanTag: "#CLAN", collectionRunId: "run-1", seasonId: "2099-01", warDay: 1 };

  it("normalizes league group and war snapshots into canonical facts", async () => {
    const repository = new MemoryRepository();
    const { group, war } = fixtures();

    expect(await normalizeSnapshot(repository, group)).toMatchObject({ snapshotId: group.id, seasons: 1, members: 30 });
    expect(await normalizeSnapshot(repository, war, warContext)).toMatchObject({ snapshotId: war.id, wars: 1, warMembers: 30, attacks: 27 });
    expect(await repository.counts()).toEqual({ seasons: 1, wars: 1, warMembers: 30, attacks: 27 });
    expect(repository.normalized).toEqual(new Set([group.id, war.id]));
  });

  it("converges changed war state on the same canonical identities", async () => {
    const repository = new MemoryRepository();
    const initial = fixtures("inWar");
    const changed = fixtures("warEnded");
    await normalizeSnapshot(repository, initial.group);
    await normalizeSnapshot(repository, initial.war, warContext);
    await normalizeSnapshot(repository, changed.war, warContext);

    expect(await repository.counts()).toEqual({ seasons: 1, wars: 1, warMembers: 30, attacks: 27 });
    expect(repository.wars.get("#WAR")?.state).toBe("warEnded");
  });

  it("does not assign other clans' round wars to the current clan", async () => {
    const repository = new MemoryRepository();
    const group: RawSnapshot = {
      id: "multi-war-group",
      endpoint: "league_group",
      requestIdentity: "#CLAN",
      collectedAt: "2099-01-01T00:00:00.000Z",
      responseBody: {
        season: "2099-01",
        clans: [{ tag: "#CLAN", members: [] }, { tag: "#OTHER", members: [] }],
        rounds: [{ warTags: ["#WAR", "#OTHER-WAR"] }],
      },
    };
    const currentWar: RawSnapshot = {
      id: "current-war",
      endpoint: "league_war",
      requestIdentity: "#WAR",
      collectedAt: "2099-01-02T00:00:00.000Z",
      responseBody: { tag: "#WAR", state: "inWar", clan: { tag: "#CLAN", members: [] }, opponent: { tag: "#OTHER", members: [] } },
    };
    const otherWar: RawSnapshot = {
      id: "other-war",
      endpoint: "league_war",
      requestIdentity: "#OTHER-WAR",
      collectedAt: "2099-01-02T00:00:00.000Z",
      responseBody: { tag: "#OTHER-WAR", state: "inWar", clan: { tag: "#OTHER", members: [] }, opponent: { tag: "#ANOTHER", members: [] } },
    };

    await normalizeSnapshot(repository, group);
    await normalizeSnapshot(repository, currentWar, warContext);
    await normalizeSnapshot(repository, otherWar, warContext);

    expect([...repository.wars.keys()]).toEqual(["#WAR"]);
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

  it("treats an unranked clan rank of zero as absent evidence rather than a zero rank", async () => {
    const repository = new MemoryRepository();
    const context = { clanTag: "#CLAN", collectionRunId: "run-1" };
    const members = {
      id: "members-unranked",
      endpoint: "members",
      requestIdentity: "#CLAN",
      collectedAt: "2099-01-02T12:00:00.000Z",
      responseBody: { items: [{
        tag: "#ONE", name: "One", role: "member", clanRank: 10, previousClanRank: 0,
        townHallLevel: 10,
      }] },
    };

    await expect(normalizeSnapshot(repository, members, context)).resolves.toMatchObject({ rosterMembers: 1 });

    expect(repository.rosterObservations[0]).toEqual(expect.objectContaining({
      members: [expect.objectContaining({ playerTag: "#ONE", clanRank: 10 })],
    }));
    expect(repository.rosterObservations[0]?.members[0]).not.toHaveProperty("previousClanRank");
  });

  it("normalizes current regular-war member participation without mixing it into CWL tables", async () => {
    const repository = new MemoryRepository();
    const currentWar: RawSnapshot = {
      id: "regular-war-1",
      endpoint: "current_war",
      requestIdentity: "#CLAN",
      collectedAt: "2099-01-04T12:00:00.000Z",
      responseBody: {
        state: "inWar",
        attacksPerMember: 2,
        teamSize: 15,
        startTime: "20990104T000000.000Z",
        endTime: "20990106T000000.000Z",
        clan: { tag: "#CLAN", members: [{ tag: "#ONE", name: "One", townHallLevel: 17, attacks: [{ stars: 3 }, { stars: 1 }] }] },
        opponent: { tag: "#OPP", members: [] },
      },
    };

    await normalizeSnapshot(repository, currentWar, { clanTag: "#CLAN", collectionRunId: "run-1" });

    expect(repository.regularWars.get("regular:#CLAN:20990104T000000.000Z")).toMatchObject({ clanTag: "#CLAN", attacksPerMember: 2 });
    expect(repository.regularWarMembers.get("regular:#CLAN:20990104T000000.000Z:#ONE")).toMatchObject({ name: "One", attacksMade: 2, stars: 4 });
    expect(await repository.counts()).toEqual({ seasons: 0, wars: 0, warMembers: 0, attacks: 0 });
  });

  it("treats notInWar after endTime as complete when the last member snapshot reached the end", async () => {
    const repository = new MemoryRepository();
    const memberSnapshot: RawSnapshot = {
      id: "regular-war-at-end",
      endpoint: "current_war",
      requestIdentity: "#CLAN",
      collectedAt: "2099-01-06T00:00:00.000Z",
      responseBody: {
        state: "inWar",
        tag: "#REGULAR-END",
        endTime: "20990106T000000.000Z",
        clan: { members: [{ tag: "#ONE", name: "One", attacks: [{ stars: 3 }] }] },
      },
    };
    const transitionSnapshot: RawSnapshot = {
      id: "regular-war-transition",
      endpoint: "current_war",
      requestIdentity: "#CLAN",
      collectedAt: "2099-01-06T00:00:05.000Z",
      responseBody: { state: "notInWar" },
    };

    await normalizeSnapshot(repository, memberSnapshot, { clanTag: "#CLAN", collectionRunId: "run-1" });
    await normalizeSnapshot(repository, transitionSnapshot, { clanTag: "#CLAN", collectionRunId: "run-1" });

    expect(repository.regularWars.get("#REGULAR-END")).toMatchObject({
      finalizationStatus: "complete_at_transition",
      finalizationObservedAt: "2099-01-06T00:00:05.000Z",
    });
  });

  it("flags a transition incomplete when the last member snapshot predates endTime", async () => {
    const repository = new MemoryRepository();
    await normalizeSnapshot(repository, {
      id: "regular-war-before-end",
      endpoint: "current_war",
      requestIdentity: "#CLAN",
      collectedAt: "2099-01-06T23:59:00.000Z",
      responseBody: {
        state: "inWar",
        tag: "#REGULAR-INCOMPLETE",
        endTime: "20990107T000000.000Z",
        clan: { members: [{ tag: "#ONE", name: "One", attacks: [] }] },
      },
    }, { clanTag: "#CLAN", collectionRunId: "run-1" });
    await normalizeSnapshot(repository, {
      id: "regular-war-after-end",
      endpoint: "current_war",
      requestIdentity: "#CLAN",
      collectedAt: "2099-01-07T00:00:05.000Z",
      responseBody: { state: "notInWar" },
    }, { clanTag: "#CLAN", collectionRunId: "run-1" });

    expect(repository.regularWars.get("#REGULAR-INCOMPLETE")?.finalizationStatus).toBe("incomplete");
  });
});
