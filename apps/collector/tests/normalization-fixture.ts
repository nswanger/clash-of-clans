import type { AttackRecord, CanonicalCounts, CanonicalRepository, MemberRecord, RawSnapshot, SeasonRecord, WarMemberRecord, WarRecord } from "../../../packages/database/src/repository.js";

export class MemoryRepository implements CanonicalRepository {
  readonly seasons = new Map<string, SeasonRecord>();
  readonly members = new Map<string, MemberRecord>();
  readonly wars = new Map<string, WarRecord>();
  readonly warMembers = new Map<string, WarMemberRecord>();
  readonly attacks = new Map<string, AttackRecord>();
  readonly normalized = new Set<string>();
  failAfterWarMembers = false;
  async upsertSeason(value: SeasonRecord) { this.seasons.set(`${value.clanTag}:${value.seasonId}`, value); }
  async upsertMember(value: MemberRecord) { this.members.set(`${value.clanTag}:${value.seasonId}:${value.playerTag}`, value); }
  async upsertWar(value: WarRecord) { this.wars.set(value.warTag, value); }
  async upsertWarMember(value: WarMemberRecord) { this.warMembers.set(`${value.warTag}:${value.playerTag}`, value); }
  async upsertAttack(value: AttackRecord) { this.attacks.set(`${value.warTag}:${value.attackerTag}:${value.attackOrder}`, value); }
  async findWarContext(warTag: string) { const war = this.wars.get(warTag); return war && { clanTag: war.clanTag, seasonId: war.seasonId, warDay: war.warDay }; }
  async completeWarMemberWrites() { if (this.failAfterWarMembers) { this.failAfterWarMembers = false; throw new Error("injected failure after war-member writes"); } }
  async markSnapshotNormalized(snapshotId: string) { this.normalized.add(snapshotId); }
  async counts(): Promise<CanonicalCounts> { return { seasons: this.seasons.size, wars: this.wars.size, warMembers: this.warMembers.size, attacks: this.attacks.size }; }
}

export function fixtures(state = "warEnded"): { group: RawSnapshot; war: RawSnapshot } {
  const members = Array.from({ length: 30 }, (_, index) => ({
    tag: `#P${String(index + 1).padStart(2, "0")}`, name: `Player ${index + 1}`,
    townHallLevel: index < 15 ? 16 : 15, mapPosition: index + 1,
    attacks: index < 27 ? [{ defenderTag: `#D${index + 1}`, stars: index % 4, destructionPercentage: 70 + index, order: index + 1, duration: 120 + index }] : [],
  }));
  return {
    group: { id: "snapshot-group", endpoint: "league_group", requestIdentity: "#CLAN", collectedAt: "2099-01-01T00:00:00.000Z", responseBody: { season: "2099-01", clans: [{ tag: "#CLAN", members }], rounds: [{ warTags: ["#WAR", "#0"] }] } },
    war: { id: `snapshot-war-${state}`, endpoint: "league_war", requestIdentity: "#WAR", collectedAt: "2099-01-02T00:00:00.000Z", responseBody: { tag: "#WAR", state, teamSize: 30, attacksPerMember: 1, preparationStartTime: "20990101T000000.000Z", startTime: "20990102T000000.000Z", endTime: "20990103T000000.000Z", clan: { tag: "#CLAN", members }, opponent: { tag: "#OPP", members: [] } } },
  };
}
