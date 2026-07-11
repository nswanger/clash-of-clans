import type { AttackRecord, CanonicalRepository, MemberRecord, SeasonRecord, WarMemberRecord, WarRecord, WarUnit } from "./repository.js";

interface QueryResult { data?: unknown; error?: { message: string } | null }
interface QueryBuilder extends PromiseLike<QueryResult> {
  upsert(values: unknown, options: { onConflict: string }): QueryBuilder;
  update(values: unknown): QueryBuilder;
  select(columns: string): QueryBuilder;
  eq(column: string, value: unknown): QueryBuilder;
  maybeSingle(): Promise<QueryResult>;
}
export interface SupabaseLikeClient { from(table: string): QueryBuilder; rpc(functionName: string, parameters: Record<string, unknown>): Promise<QueryResult> }

export class SupabaseCanonicalRepository implements CanonicalRepository {
  constructor(private readonly client: SupabaseLikeClient) {}

  async upsertSeason(value: SeasonRecord) {
    await this.upsert("cwl_seasons", snake(value), "clan_tag,season_id");
  }
  async upsertMember(value: MemberRecord) {
    await this.upsert("cwl_members", snake(value), "clan_tag,season_id,player_tag");
  }
  async upsertWar(value: WarRecord) { await this.upsert("cwl_wars", snake(value), "war_tag"); }
  async upsertWarMember(value: WarMemberRecord) {
    await this.upsert("cwl_war_members", snake(value), "war_tag,player_tag");
  }
  async upsertAttack(value: AttackRecord) {
    await this.upsert("cwl_attacks", snake(value), "war_tag,attacker_tag,attack_order");
  }
  async applyWarUnit(unit: WarUnit) {
    check(await this.client.rpc("apply_cwl_war_unit", {
      p_war: snake(unit.war),
      p_members: unit.members.map(snake),
      p_attacks: unit.attacks.map(snake),
    }));
  }
  async findWarContext(warTag: string) {
    const result = await this.client.from("cwl_wars").select("clan_tag,season_id,war_day").eq("war_tag", warTag).maybeSingle();
    check(result);
    const row = result.data as { clan_tag: string; season_id: string; war_day: number } | null | undefined;
    return row ? { clanTag: row.clan_tag, seasonId: row.season_id, warDay: row.war_day } : undefined;
  }
  async markSnapshotNormalized(snapshotId: string, normalizedAt: string) {
    check(await this.client.from("raw_snapshots").update({ normalized_at: normalizedAt }).eq("id", snapshotId));
  }
  private async upsert(table: string, value: unknown, onConflict: string) {
    check(await this.client.from(table).upsert(value, { onConflict }));
  }
}

function snake(value: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([key, item]) => [key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`), item]));
}
function check(result: QueryResult): void {
  if (result.error) throw new Error(result.error.message);
}
