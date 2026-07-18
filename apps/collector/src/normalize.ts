import type { RawSnapshot } from "./raw-snapshots.js";

export interface SeasonRecord {
  clanTag: string;
  seasonId: string;
  warSize: 15 | 30;
  targetCoreSize: number;
  rotationPositions: number;
  priorityMode: "balanced" | "standings_first";
  eightStarRotationEnabled: boolean;
}

export interface MemberRecord {
  clanTag: string;
  seasonId: string;
  playerTag: string;
  name: string;
  townHallLevel: number;
}

export interface WarRecord {
  warTag: string;
  clanTag: string;
  seasonId: string;
  warDay: number;
  state: string;
  preparationStartTime?: string;
  startTime?: string;
  endTime?: string;
  opponentTag?: string;
  attacksPerMember: number;
}

export interface WarMemberRecord {
  warTag: string;
  playerTag: string;
  mapPosition: number;
  townHallLevel?: number;
  assignedAttacks: number;
}

export interface AttackRecord {
  warTag: string;
  attackerTag: string;
  attackOrder: number;
  defenderTag?: string;
  stars: number;
  destruction: number;
  durationSeconds?: number;
  recordedAt: string;
}

export interface WarUnit {
  war: WarRecord;
  members: WarMemberRecord[];
  attacks: AttackRecord[];
}

export interface CanonicalRepository {
  upsertSeason(record: SeasonRecord): Promise<void>;
  upsertMember(record: MemberRecord): Promise<void>;
  upsertWar(record: WarRecord): Promise<void>;
  upsertWarMember(record: WarMemberRecord): Promise<void>;
  upsertAttack(record: AttackRecord): Promise<void>;
  applyWarUnit(unit: WarUnit): Promise<void>;
  findWarContext(warTag: string): Promise<{ clanTag: string; seasonId: string; warDay: number } | undefined>;
  markSnapshotNormalized(snapshotId: string, normalizedAt: string): Promise<void>;
}

export interface NormalizationSummary {
  snapshotId: string;
  seasons: number;
  members: number;
  wars: number;
  warMembers: number;
  attacks: number;
}

type Json = Record<string, any>;

export async function normalizeSnapshot(repository: CanonicalRepository, snapshot: RawSnapshot): Promise<NormalizationSummary> {
  const summary: NormalizationSummary = { snapshotId: snapshot.id, seasons: 0, members: 0, wars: 0, warMembers: 0, attacks: 0 };
  if (snapshot.endpoint === "league_group") await normalizeGroup(repository, snapshot, summary);
  else if (snapshot.endpoint === "league_war") await normalizeWar(repository, snapshot, summary);
  else return summary;
  await repository.markSnapshotNormalized(snapshot.id, new Date().toISOString());
  return summary;
}

async function normalizeGroup(repository: CanonicalRepository, snapshot: RawSnapshot, summary: NormalizationSummary) {
  const group = object(snapshot.responseBody, "league group");
  const seasonId = text(group.season, "season");
  const clan = array(group.clans).map(value => object(value, "clan")).find(value => value.tag === snapshot.requestIdentity);
  if (!clan) throw new Error(`CWL group does not contain clan ${snapshot.requestIdentity}`);
  const members = array(clan.members).map(value => object(value, "member"));
  const warSize = members.length >= 30 ? 30 : 15;
  const season: SeasonRecord = {
    clanTag: snapshot.requestIdentity, seasonId, warSize,
    targetCoreSize: warSize === 15 ? 10 : 20,
    rotationPositions: warSize === 15 ? 5 : 10,
    priorityMode: "balanced", eightStarRotationEnabled: true,
  };
  await repository.upsertSeason(season); summary.seasons++;
  for (const member of members) {
    await repository.upsertMember({ clanTag: season.clanTag, seasonId, playerTag: text(member.tag, "member tag"), name: text(member.name, "member name"), townHallLevel: integer(member.townHallLevel, "town hall") });
    summary.members++;
  }
  const rounds = array(group.rounds);
  for (let index = 0; index < rounds.length; index++) {
    for (const warTagValue of array(object(rounds[index], "round").warTags)) {
      const warTag = text(warTagValue, "war tag");
      if (warTag === "#0") continue;
      await repository.upsertWar({ warTag, clanTag: season.clanTag, seasonId, warDay: index + 1, state: "unknown", attacksPerMember: 1 });
      summary.wars++;
    }
  }
}

async function normalizeWar(repository: CanonicalRepository, snapshot: RawSnapshot, summary: NormalizationSummary) {
  const payload = object(snapshot.responseBody, "league war");
  const warTag = text(payload.tag ?? snapshot.requestIdentity, "war tag");
  const context = await repository.findWarContext(warTag);
  if (!context) throw new Error(`No CWL season context exists for war ${warTag}`);
  const first = object(payload.clan, "war clan");
  const second = object(payload.opponent, "war opponent");
  const clan = first.tag === context.clanTag ? first : second.tag === context.clanTag ? second : undefined;
  const opponent = clan === first ? second : first;
  if (!clan) throw new Error(`War ${warTag} does not contain clan ${context.clanTag}`);
  const attacksPerMember = optionalInteger(payload.attacksPerMember) ?? 1;
  const war: WarRecord = {
    warTag, ...context, state: text(payload.state, "war state"), attacksPerMember,
    ...optional("preparationStartTime", clashTime(payload.preparationStartTime)),
    ...optional("startTime", clashTime(payload.startTime)),
    ...optional("endTime", clashTime(payload.endTime)),
    ...optional("opponentTag", optionalText(opponent.tag)),
  };
  const members = array(clan.members).map(value => object(value, "war member"));
  const memberRecords: WarMemberRecord[] = [];
  const attackRecords: AttackRecord[] = [];
  for (const member of members) {
    memberRecords.push({ warTag, playerTag: text(member.tag, "player tag"), mapPosition: integer(member.mapPosition, "map position"), ...optional("townHallLevel", optionalInteger(member.townHallLevel)), assignedAttacks: attacksPerMember });
    summary.warMembers++;
    for (const attackValue of array(member.attacks)) {
      const attack = object(attackValue, "attack");
      attackRecords.push({ warTag, attackerTag: text(member.tag, "attacker tag"), attackOrder: integer(attack.order, "attack order"), ...optional("defenderTag", optionalText(attack.defenderTag)), stars: integer(attack.stars, "stars"), destruction: numberValue(attack.destructionPercentage, "destruction"), ...optional("durationSeconds", optionalInteger(attack.duration)), recordedAt: snapshot.collectedAt });
      summary.attacks++;
    }
  }
  await repository.applyWarUnit({ war, members: memberRecords, attacks: attackRecords });
  summary.wars++;
}

function object(value: unknown, label: string): Json { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Invalid ${label}`); return value as Json; }
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function text(value: unknown, label: string): string { if (typeof value !== "string" || !value.trim()) throw new Error(`Invalid ${label}`); return value; }
function optionalText(value: unknown): string | undefined { return typeof value === "string" && value.trim() ? value : undefined; }
function numberValue(value: unknown, label: string): number { if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`Invalid ${label}`); return value; }
function integer(value: unknown, label: string): number { const result = numberValue(value, label); if (!Number.isInteger(result)) throw new Error(`Invalid ${label}`); return result; }
function optionalInteger(value: unknown): number | undefined { return typeof value === "number" && Number.isInteger(value) ? value : undefined; }
function optional<Key extends string, Value>(key: Key, value: Value | undefined): { [Property in Key]?: Value } { return value === undefined ? {} : { [key]: value } as { [Property in Key]?: Value }; }
function clashTime(value: unknown): string | undefined { const raw = optionalText(value); if (!raw) return undefined; const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})\.\d{3}Z$/.exec(raw); return match ? `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}.000Z` : raw; }
