import { describe, expect, it, vi } from "vitest";
import { SupabaseCanonicalRepository } from "../../../packages/database/src/supabase-repository.js";
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
  it("uses one database RPC for an authoritative war unit", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const repository = new SupabaseCanonicalRepository({ rpc, from: vi.fn() as any });
    const memory = new MemoryRepository();
    const { group, war } = fixtures();
    await normalizeSnapshot(memory, group);
    const payload = war.responseBody as any;
    const context = await memory.findWarContext("#WAR");

    await repository.applyWarUnit({
      war: { warTag: "#WAR", ...context!, state: payload.state, attacksPerMember: 1 },
      members: [], attacks: [],
    });

    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith("apply_cwl_war_unit", expect.objectContaining({
      p_war: expect.objectContaining({ war_tag: "#WAR" }), p_members: [], p_attacks: [],
    }));
  });

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
    expect(await retried.counts()).toEqual({ seasons: 1, wars: 1, warMembers: 0, attacks: 0 });
    expect(retried.wars.get("#WAR")?.state).toBe("unknown");
    await normalizeSnapshot(retried, war);

    expect(await retried.counts()).toEqual({ seasons: 1, wars: 1, warMembers: 30, attacks: 27 });
    expect(await recommendationInputHash(retried)).toBe(await recommendationInputHash(clean));
  });

  it("removes absent facts and corrects attacks from a newer authoritative state", async () => {
    const repository = new MemoryRepository();
    const initial = fixtures("inWar");
    await normalizeSnapshot(repository, initial.group);
    await normalizeSnapshot(repository, initial.war);
    const corrected = structuredClone(fixtures("warEnded").war);
    const body = corrected.responseBody as any;
    body.clan.members = body.clan.members.slice(0, 29);
    body.clan.members[0].attacks = [];
    body.clan.members[1].attacks[0].stars = 3;

    await normalizeSnapshot(repository, corrected);

    expect(await repository.counts()).toEqual({ seasons: 1, wars: 1, warMembers: 29, attacks: 26 });
    expect(repository.attacks.get("#WAR:#P02:2")?.stars).toBe(3);
    expect(repository.warMembers.has("#WAR:#P30")).toBe(false);
    expect(repository.attacks.has("#WAR:#P01:1")).toBe(false);
  });
});
