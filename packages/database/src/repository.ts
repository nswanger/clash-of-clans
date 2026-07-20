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
export interface DailyRosterMemberRecord {
  playerTag: string;
  name: string;
  role?: string;
  clanRank?: number;
  previousClanRank?: number;
  townHallLevel: number;
  trophies?: number;
  leagueId?: number;
  leagueName?: string;
  donations?: number;
  donationsReceived?: number;
}
export interface DailyRosterObservation {
  clanTag: string;
  observedOn: string;
  rosterObservedAt: string;
  collectionRunId: string;
  members: DailyRosterMemberRecord[];
}
export interface DailyMemberProfile {
  clanTag: string;
  observedOn: string;
  playerTag: string;
  profileObservedAt: string;
  collectionRunId: string;
  warPreference?: string;
  warStars?: number;
  attackWins?: number;
  defenseWins?: number;
  clanCapitalContributions?: number;
  clanGamesPoints?: number;
}

export interface CanonicalRepository {
  upsertSeason(record: SeasonRecord): Promise<void>;
  upsertMember(record: MemberRecord): Promise<void>;
  upsertWar(record: WarRecord): Promise<void>;
  upsertWarMember(record: WarMemberRecord): Promise<void>;
  upsertAttack(record: AttackRecord): Promise<void>;
  applyWarUnit(unit: WarUnit): Promise<void>;
  applyMemberRosterDaily(observation: DailyRosterObservation): Promise<number>;
  applyMemberProfileDaily(profile: DailyMemberProfile): Promise<boolean>;
  findWarContext(warTag: string): Promise<{ clanTag: string; seasonId: string; warDay: number } | undefined>;
  markSnapshotNormalized(snapshotId: string, normalizedAt: string): Promise<void>;
}
