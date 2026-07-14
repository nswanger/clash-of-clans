import type { DashboardSnapshot } from "./dashboard-model.js";

interface QueryResult<T> { data: T; error: { message: string } | null }

interface QueryBuilder<T = unknown> extends PromiseLike<QueryResult<T>> {
  select(columns: string): QueryBuilder<T>;
  eq(column: string, value: string): QueryBuilder<T>;
  in(column: string, values: string[]): QueryBuilder<T>;
  order(column: string, options?: { ascending?: boolean }): QueryBuilder<T>;
  limit(count: number): QueryBuilder<T>;
  single(): Promise<QueryResult<T>>;
  maybeSingle(): Promise<QueryResult<T>>;
}

export interface DashboardDataClient {
  from(table: string): QueryBuilder;
}

function valueOrThrow<T>(result: QueryResult<T>, context: string): T {
  if (result.error) throw new Error(`${context}: ${result.error.message}`);
  return result.data;
}

const emptyRecommendation: DashboardSnapshot["recommendation"] = {
  changes: [], contacts: [], coverageGaps: [], confidenceNotes: [],
};

function emptySnapshot(
  clanName: string,
  state: "no_season" | "no_active_war",
  season: DashboardSnapshot["season"],
): DashboardSnapshot {
  return {
    clanName,
    state,
    season,
    war: null,
    members: [],
    assignments: [],
    attacks: [],
    availability: [],
    eligibility: [],
    collection: {
      status: "stale",
      last_fresh_at: new Date(0).toISOString(),
      error_message: "No successful collection is available.",
    },
    recommendation: emptyRecommendation,
  };
}

export async function loadDashboardSnapshot(client: DashboardDataClient, clanTag: string): Promise<DashboardSnapshot> {
  const seasonResult = await client.from("cwl_seasons")
    .select("clan_tag,season_id,war_size")
    .eq("clan_tag", clanTag)
    .order("season_id", { ascending: false })
    .limit(1)
    .maybeSingle() as QueryResult<DashboardSnapshot["season"] | null>;
  const season = valueOrThrow(seasonResult, "Unable to load the current CWL season");
  if (!season) return emptySnapshot(clanTag, "no_season", null);

  const warResult = await client.from("cwl_wars")
    .select("war_tag,war_day,end_time,attacks_per_member")
    .eq("clan_tag", clanTag)
    .eq("season_id", season.season_id)
    .in("state", ["preparation", "inWar"])
    .order("war_day", { ascending: false })
    .limit(1)
    .maybeSingle() as QueryResult<DashboardSnapshot["war"] | null>;
  const war = valueOrThrow(warResult, "Unable to load the current CWL war");
  if (!war?.end_time) return emptySnapshot(clanTag, "no_active_war", season);

  const [membersResult, assignmentsResult, attacksResult, availabilityResult, eligibilityResult, attemptResult, recommendationResult] = await Promise.all([
    client.from("cwl_members").select("player_tag,name,town_hall_level").eq("clan_tag", clanTag).eq("season_id", season.season_id),
    client.from("cwl_war_members").select("player_tag,assigned_attacks").eq("war_tag", war.war_tag),
    client.from("cwl_attacks").select("attacker_tag").eq("war_tag", war.war_tag),
    client.from("member_availability").select("player_tag,status").eq("clan_tag", clanTag).eq("season_id", season.season_id),
    client.from("cwl_eight_star_eligibility").select("player_tag,stars,eight_star_eligible").eq("clan_tag", clanTag).eq("season_id", season.season_id),
    client.from("collection_attempts").select("run_id").eq("request_identity", clanTag).order("started_at", { ascending: false }).limit(1).maybeSingle(),
    client.from("recommendations").select("id,output").eq("clan_tag", clanTag).eq("season_id", season.season_id).eq("status", "proposed").order("proposed_at", { ascending: false }).limit(1).maybeSingle(),
  ]) as Array<QueryResult<unknown>>;

  const attempt = valueOrThrow(attemptResult!, "Unable to locate collection health") as { run_id: string } | null;
  const collectionResult = attempt
    ? await client.from("collection_runs").select("status,last_fresh_at,error_message").eq("id", attempt.run_id).single() as QueryResult<DashboardSnapshot["collection"]>
    : { data: null, error: null };
  const collection = valueOrThrow(collectionResult, "Unable to load collection health") as DashboardSnapshot["collection"] | null;
  const recommendationRow = valueOrThrow(recommendationResult!, "Unable to load recommendations") as { id: string; output: DashboardSnapshot["recommendation"] } | null;
  return {
    clanName: clanTag,
    state: "ready",
    season,
    war,
    members: valueOrThrow(membersResult!, "Unable to load CWL members") as DashboardSnapshot["members"],
    assignments: valueOrThrow(assignmentsResult!, "Unable to load war assignments") as DashboardSnapshot["assignments"],
    attacks: valueOrThrow(attacksResult!, "Unable to load attacks") as DashboardSnapshot["attacks"],
    availability: valueOrThrow(availabilityResult!, "Unable to load availability") as DashboardSnapshot["availability"],
    eligibility: valueOrThrow(eligibilityResult!, "Unable to load star eligibility") as DashboardSnapshot["eligibility"],
    collection: collection ?? { status: "stale", last_fresh_at: new Date(0).toISOString(), error_message: "No successful collection is available." },
    recommendation: recommendationRow?.output ?? emptyRecommendation,
    ...(recommendationRow ? { recommendationId: recommendationRow.id } : {}),
  };
}
