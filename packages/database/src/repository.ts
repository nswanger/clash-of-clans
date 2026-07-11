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

export interface RawSnapshot {
  id: string;
  endpoint: string;
  requestIdentity: string;
  collectedAt: string;
  responseBody: unknown;
}

export interface CanonicalCounts { seasons: number; wars: number; warMembers: number; attacks: number }
export interface WarUnit { war: WarRecord; members: WarMemberRecord[]; attacks: AttackRecord[] }

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
