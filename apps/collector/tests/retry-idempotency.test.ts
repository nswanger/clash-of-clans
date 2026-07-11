import { describe, expect, it } from "vitest";
import { fingerprintJson } from "../src/raw-snapshots.js";
import { normalizeSnapshot } from "../src/normalize.js";
import { fixtures, MemoryRepository } from "./normalization-fixture.js";

async function recommendationInputHash(repository: MemoryRepository): Promise<string> {
  const inputs = {
    wars: [...repository.wars.values()],
    warMembers: [...repository.warMembers.values()],
    attacks: [...repository.attacks.values()],
  };
  return fingerprintJson(inputs);
}

describe("normalization retry idempotency", () => {
  it("does not duplicate canonical facts when identical snapshots replay", async () => {
    const repository = new MemoryRepository();
    const { group, war } = fixtures();
    await normalizeSnapshot(repository, group);
    await normalizeSnapshot(repository, war);
    await normalizeSnapshot(repository, group);
    await normalizeSnapshot(repository, war);

    expect(await repository.counts()).toEqual({ seasons: 1, wars: 1, warMembers: 30, attacks: 27 });
  });

  it("a retry after partial war writes converges with a clean run", async () => {
    const clean = new MemoryRepository();
    const retried = new MemoryRepository();
    const { group, war } = fixtures();
    await normalizeSnapshot(clean, group);
    await normalizeSnapshot(clean, war);
    await normalizeSnapshot(retried, group);
    retried.failAfterWarMembers = true;

    await expect(normalizeSnapshot(retried, war)).rejects.toThrow("injected failure");
    expect(retried.normalized).not.toContain(war.id);
    await normalizeSnapshot(retried, war);

    expect(await retried.counts()).toEqual({ seasons: 1, wars: 1, warMembers: 30, attacks: 27 });
    expect(await recommendationInputHash(retried)).toBe(await recommendationInputHash(clean));
  });
});
