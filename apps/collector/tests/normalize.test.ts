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
});
