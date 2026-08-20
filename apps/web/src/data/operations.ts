interface Result<T = unknown> { data?: T; error: { message: string } | null }

export type RecommendationRegenerationResult =
  | { status: "skipped"; reason: "no_active_cwl_context" }
  | { status: "persisted"; recommendationId: string; created: boolean };

export interface InvitationClient {
  rpc(name: string, args: Record<string, unknown>): Promise<Result<any>>;
}

export interface AccessPerson {
  id: string;
  name: string;
  role: "leader" | "admin";
  isCurrentUser: boolean;
}

export interface AccessInvitation {
  id: string;
  status: "pending" | "redeemed" | "expired" | "revoked";
  createdAt: string;
  expiresAt: string;
  createdByName: string;
  usedAt: string | null;
  usedByName: string | null;
  revokedAt: string | null;
  revokedByName: string | null;
  reissuedFromId: string | null;
  reissuedInvitationId: string | null;
}

export interface AccessAuditEvent {
  id: string;
  eventType: "invitation_created" | "invitation_redeemed" | "invitation_revoked" | "invitation_reissued" | "role_granted" | "role_revoked";
  actorName: string;
  targetName: string | null;
  eventData: Record<string, unknown>;
  occurredAt: string;
}

export interface AccessManagementSnapshot {
  people: AccessPerson[];
  invitations: AccessInvitation[];
  auditEvents: AccessAuditEvent[];
}

export type AccessManagementClient = InvitationClient;

export type CwlAvailability = "available" | "unavailable" | "unknown";
export type CwlMemberRole = "leader" | "coLeader" | "elder" | "member" | "unknown";
export type CwlWarState = "preparation" | "inWar" | "warEnded" | "unknown";

export interface CwlDailyLineupPlan {
  clanTag: string;
  seasonId: string;
  warDay: number;
  revision: number;
  isLocked: boolean;
  lockedAt: string | null;
  lockedBy: string | null;
  inheritedFromWarDay: number | null;
  createdAt: string;
  createdBy: string | null;
  updatedAt: string;
  updatedBy: string | null;
  playerTags: string[];
}

export interface CwlLineupMember {
  playerTag: string;
  name: string;
  townHallLevel: number;
  role: CwlMemberRole;
  availability: CwlAvailability;
  assignedAttacks: number;
  completedAttacks: number;
  stars: number;
  observed: boolean;
  currentWarAssignedAttacks: number;
  currentWarAttacksMade: number;
  attackEvidenceWarDay: number | null;
  regularWarsObserved: number;
  regularWarsParticipated: number;
  regularWarsIncomplete: number;
  regularAssignedAttacks: number;
  regularAttacksMade: number;
  regularActivityScore: number | null;
  regularPerformanceScore: number | null;
  regularStarsPerAttack: number | null;
  regularLastObservedAt: string | null;
  overallRating: number | null;
  cwlWarsParticipated: number;
  bonusPriorityScore: number | null;
}

export interface CwlLineupWarDay {
  warDay: number;
  state: CwlWarState;
  preparationStartTime: string | null;
  startTime: string | null;
  endTime: string | null;
  updatedAt: string | null;
}

/* No `mapPosition`, though `cwl_war_members` carries it. #25 gave wave 2 the
 * choice of using it as the in-game order or dropping it; it cannot be the
 * former. Reorder mode exists to set the order BEFORE the war starts, and a map
 * position only exists after the game has assigned one — so the field can never
 * be there when the surface that would want it is in use. Collection still
 * records it; nothing on this surface reads it. */
export interface CwlLineupObservedMember {
  playerTag: string;
  assignedAttacks: number;
}

export interface CwlLineupHistoryEvent {
  id: string;
  eventType: string;
  label: string;
  actorName: string;
  occurredAt: string;
  eventData: Record<string, unknown>;
}

/* One membership change a leader confirmed making in the game (#36). A swap is
 * a single record carrying both halves, matching the single check control the
 * checklist gives it. */
export interface CwlAppliedLineupChange {
  changeSequence: number;
  removedPlayerTag: string | null;
  addedPlayerTag: string | null;
  appliedAt: string;
}

/* What the game is known to hold for one war day: a base member set plus the
 * ordered acts confirmed over it. `playerTags` is the server's replay of the
 * two, which is the baseline the checklist subtracts from the saved plan.
 *
 * `revision` advances on every baseline mutation. It is NOT the plan's revision
 * and must never be compared to it — this record is of physical acts, so it
 * stays true when the plan changes underneath it. */
export interface CwlAppliedLineupBaseline {
  warDay: number;
  revision: number;
  baseSource: "plan" | "observed" | "confirmed";
  basePlayerTags: string[];
  appliedChanges: CwlAppliedLineupChange[];
  playerTags: string[];
}

/* One fact per season: whether the bonus medals were handed out. `null` is the
 * whole of "not yet" — there is no boolean beside it, because a flag plus an
 * instant is two records of one thing. */
export interface CwlBonusAdministration {
  clanTag: string;
  seasonId: string;
  bonusesAdministeredAt: string | null;
}

export interface CwlLineupWorkspaceSnapshot {
  season: {
    clanTag: string;
    seasonId: string;
    warSize: number;
  };
  plan: CwlDailyLineupPlan;
  members: CwlLineupMember[];
  observed: CwlLineupObservedMember[];
  appliedBaseline: CwlAppliedLineupBaseline;
  history: CwlLineupHistoryEvent[];
  observedUpdatedAt: string | null;
  warDays: CwlLineupWarDay[];
  freshness: {
    lastRefreshedAt: string | null;
    collectionStatus: string | null;
  };
}

export interface RecommendationFunctionClient {
  functions: {
    invoke(
      name: "regenerate-recommendations",
      options: { body: { clanTag: string } },
    ): Promise<Result<unknown>>;
  };
}

function rows<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : value && typeof value === "object" ? [value as T] : [];
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function planFromRpc(value: unknown): CwlDailyLineupPlan {
  const plan = record(Array.isArray(value) ? value[0] : value);
  if (typeof plan.clanTag !== "string" || typeof plan.seasonId !== "string" || typeof plan.warDay !== "number" || typeof plan.revision !== "number") {
    throw new Error("Lineup plan returned an invalid response.");
  }
  return {
    clanTag: plan.clanTag,
    seasonId: plan.seasonId,
    warDay: plan.warDay,
    revision: plan.revision,
    isLocked: plan.isLocked === true,
    lockedAt: typeof plan.lockedAt === "string" ? plan.lockedAt : null,
    lockedBy: typeof plan.lockedBy === "string" ? plan.lockedBy : null,
    inheritedFromWarDay: typeof plan.inheritedFromWarDay === "number" ? plan.inheritedFromWarDay : null,
    createdAt: typeof plan.createdAt === "string" ? plan.createdAt : new Date(0).toISOString(),
    createdBy: typeof plan.createdBy === "string" ? plan.createdBy : null,
    updatedAt: typeof plan.updatedAt === "string" ? plan.updatedAt : new Date(0).toISOString(),
    updatedBy: typeof plan.updatedBy === "string" ? plan.updatedBy : null,
    playerTags: Array.isArray(plan.playerTags) ? plan.playerTags.filter((tag): tag is string => typeof tag === "string") : [],
  };
}

export function normalizeClanRole(value: unknown): CwlMemberRole {
  if (value === "admin") return "elder";
  if (value === "leader") return "leader";
  if (value === "coLeader") return "coLeader";
  if (value === "member") return "member";
  return "unknown";
}

function appliedBaselineFromRpc(value: unknown): CwlAppliedLineupBaseline {
  const row = record(value);
  const tags = (input: unknown) => Array.isArray(input) ? input.filter((tag): tag is string => typeof tag === "string") : [];
  const source = row.baseSource;
  return {
    warDay: typeof row.warDay === "number" ? row.warDay : 0,
    revision: typeof row.revision === "number" ? row.revision : 0,
    baseSource: source === "observed" || source === "confirmed" ? source : "plan",
    basePlayerTags: tags(row.basePlayerTags),
    appliedChanges: Array.isArray(row.appliedChanges) ? row.appliedChanges.flatMap((change) => {
      const item = record(change);
      if (typeof item.changeSequence !== "number") return [];
      return [{
        changeSequence: item.changeSequence,
        removedPlayerTag: typeof item.removedPlayerTag === "string" ? item.removedPlayerTag : null,
        addedPlayerTag: typeof item.addedPlayerTag === "string" ? item.addedPlayerTag : null,
        appliedAt: typeof item.appliedAt === "string" ? item.appliedAt : "",
      } satisfies CwlAppliedLineupChange];
    }) : [],
    playerTags: tags(row.playerTags),
  };
}

function historyLabel(eventType: string): string {
  return {
    lineup_plan_initialized: "Lineup day initialized",
    lineup_plan_saved: "Lineup plan saved",
    lineup_plan_locked: "Lineup day locked",
    lineup_plan_unlocked: "Lineup day unlocked",
    lineup_plan_reinherited: "Lineup plan re-inherited",
  }[eventType] ?? eventType;
}

export async function loadCurrentCwlLineupWorkspace(client: any, clanTag: string, warDay?: number): Promise<CwlLineupWorkspaceSnapshot> {
  const seasonResult = await client.from("cwl_seasons")
    .select("clan_tag,season_id,war_size")
    .eq("clan_tag", clanTag)
    .order("season_id", { ascending: false })
    .limit(1)
    .maybeSingle();
  ensureSuccess(seasonResult, "Unable to load the current CWL season");
  if (!seasonResult.data) throw new Error("No CWL season is available.");

  let selectedWarDay = warDay ?? 1;
  if (warDay === undefined) {
    const warResult = await client.from("cwl_wars")
      .select("war_day,state")
      .eq("clan_tag", clanTag)
      .eq("season_id", seasonResult.data.season_id)
      .in("state", ["preparation", "inWar"])
      .order("war_day", { ascending: false })
      .limit(1)
      .maybeSingle();
    ensureSuccess(warResult, "Unable to load the current CWL war");
    if (warResult.data && typeof warResult.data.war_day === "number") selectedWarDay = warResult.data.war_day;
  }
  return loadCwlLineupWorkspace(client, clanTag, seasonResult.data.season_id, selectedWarDay);
}

export async function loadCwlLineupWorkspace(
  client: any,
  clanTag: string,
  seasonId: string,
  warDay: number,
): Promise<CwlLineupWorkspaceSnapshot> {
  const planResult = await client.rpc("ensure_cwl_daily_lineup_plan", {
    requested_clan_tag: clanTag,
    requested_season_id: seasonId,
    requested_war_day: warDay,
  });
  ensureSuccess(planResult, "Unable to initialize the lineup day");
  const plan = planFromRpc(planResult.data);

  /* Seeded after the plan, not beside it: with no observed war roster the
   * baseline is seeded from the plan, so it has to exist first. Seeding is
   * once-only — a second call returns the baseline it already has, which is
   * what keeps a leader's part-done checklist across a reload. */
  const baselineResult = await client.rpc("ensure_cwl_applied_lineup", {
    requested_clan_tag: clanTag,
    requested_season_id: seasonId,
    requested_war_day: warDay,
  });
  ensureSuccess(baselineResult, "Unable to load what the game is known to hold");
  const appliedBaseline = appliedBaselineFromRpc(baselineResult.data);

  const [seasonResult, membersResult, availabilityResult, rosterResult, reliabilityResult, starsResult, ratingResult, activityResult, warResult, warDaysResult, auditResult, collectionResult] = await Promise.all([
    client.from("cwl_seasons").select("clan_tag,season_id,war_size").eq("clan_tag", clanTag).eq("season_id", seasonId).single(),
    client.from("cwl_members").select("player_tag,name,town_hall_level").eq("clan_tag", clanTag).eq("season_id", seasonId).order("name"),
    client.from("member_availability").select("player_tag,status,recorded_at").eq("clan_tag", clanTag).eq("season_id", seasonId),
    client.from("member_roster_overview").select("player_tag,role,roster_observed_at").eq("clan_tag", clanTag).eq("is_current_member", true),
    client.from("cwl_current_reliability").select("player_tag,assigned_opportunities,completed_assigned_attacks").eq("clan_tag", clanTag).eq("season_id", seasonId),
    client.from("cwl_member_stars").select("player_tag,stars").eq("clan_tag", clanTag).eq("season_id", seasonId),
    client.from("cwl_member_overall_rating").select("player_tag,regular_wars_observed,regular_wars_participated,regular_assigned_attacks,regular_attacks_made,regular_activity_score,regular_performance_score,regular_stars_per_attack,regular_last_observed_at,overall_rating,cwl_wars_participated,bonus_priority_score").eq("clan_tag", clanTag).eq("season_id", seasonId),
    client.from("regular_war_member_activity").select("player_tag,wars_participated,assigned_attacks,attacks_made,stars,last_observed_at,activity_score,performance_score,stars_per_attack,incomplete_wars").eq("clan_tag", clanTag),
    client.from("cwl_wars").select("war_tag,war_day,state,preparation_start_time,start_time,end_time,updated_at").eq("clan_tag", clanTag).eq("season_id", seasonId).eq("war_day", warDay).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    client.from("cwl_wars").select("war_tag,war_day,state,preparation_start_time,start_time,end_time,updated_at").eq("clan_tag", clanTag).eq("season_id", seasonId).order("war_day"),
    client.from("audit_events").select("id,event_type,event_data,actor_id,occurred_at").eq("entity_type", "cwl_daily_lineup_plan").eq("entity_id", `${clanTag}:${seasonId}:${warDay}`).order("occurred_at", { ascending: false }).limit(25),
    client.from("collection_runs").select("status,last_fresh_at").order("started_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  for (const [result, context] of [
    [seasonResult, "Unable to load the CWL season"],
    [membersResult, "Unable to load CWL members"],
    [availabilityResult, "Unable to load availability"],
    [rosterResult, "Unable to load current clan roles"],
    [reliabilityResult, "Unable to load attack completion"],
    [starsResult, "Unable to load CWL stars"],
    [ratingResult, "Unable to load player ratings"],
    [activityResult, "Unable to load regular-war activity"],
    [warResult, "Unable to load observed war data"],
    [warDaysResult, "Unable to load CWL war states"],
    [auditResult, "Unable to load lineup history"],
  ] as Array<[Result, string]>) ensureSuccess(result, context);

  const war = record(warResult.data);
  const observedResult = war.war_tag
    ? await Promise.all([
        client.from("cwl_war_members").select("player_tag,assigned_attacks").eq("war_tag", war.war_tag).order("player_tag"),
        client.from("cwl_attacks").select("attacker_tag,stars").eq("war_tag", war.war_tag),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];
  ensureSuccess(observedResult[0], "Unable to load the observed lineup");
  ensureSuccess(observedResult[1], "Unable to load observed attacks");

  const warRows = rows<{ war_tag: string; war_day: number; state: string }>(warDaysResult.data);
  const selectedWarHasStarted = war.state === "inWar" || war.state === "warEnded";
  const latestStartedWar = [...warRows]
    .filter((row) => (selectedWarHasStarted && row.war_day === warDay) || (!selectedWarHasStarted && row.war_day < warDay))
    .filter((row) => row.state === "inWar" || row.state === "warEnded")
    .sort((left, right) => right.war_day - left.war_day)[0];
  const attackEvidenceWar = latestStartedWar ?? (typeof war.war_tag === "string" ? { war_tag: war.war_tag, war_day: warDay, state: "unknown" } : undefined);
  const attackEvidenceResult = attackEvidenceWar && attackEvidenceWar.war_tag !== war.war_tag
    ? await Promise.all([
        client.from("cwl_war_members").select("player_tag,assigned_attacks").eq("war_tag", attackEvidenceWar.war_tag),
        client.from("cwl_attacks").select("attacker_tag,stars").eq("war_tag", attackEvidenceWar.war_tag),
      ])
    : observedResult;
  ensureSuccess(attackEvidenceResult[0], "Unable to load attack assignments");
  ensureSuccess(attackEvidenceResult[1], "Unable to load attack evidence");

  const availabilityRows = rows<{ player_tag: string; status: CwlAvailability; recorded_at: string | null }>(availabilityResult.data);
  const availability = new Map(availabilityRows.map((row) => [row.player_tag, row.status]));
  const roleRows = rows<{ player_tag: string; role: string; roster_observed_at: string | null }>(rosterResult.data);
  const roles = new Map(roleRows.map((row) => [row.player_tag, {
    role: normalizeClanRole(row.role),
  }]));
  const reliability = new Map(rows<{ player_tag: string; assigned_opportunities: number; completed_assigned_attacks: number }>(reliabilityResult.data).map((row) => [row.player_tag, row]));
  const stars = new Map(rows<{ player_tag: string; stars: number }>(starsResult.data).map((row) => [row.player_tag, row.stars]));
  const ratings = new Map(rows<{
    player_tag: string;
    regular_wars_observed: number;
    regular_wars_participated: number;
    regular_assigned_attacks: number;
    regular_attacks_made: number;
    regular_activity_score: number | null;
    regular_performance_score: number | null;
    regular_stars_per_attack: number | null;
    regular_last_observed_at: string | null;
    overall_rating: number | null;
    cwl_wars_participated: number;
    bonus_priority_score: number | null;
  }>(ratingResult.data).map((row) => [row.player_tag, row]));
  const activity = new Map(rows<{
    player_tag: string;
    wars_participated: number;
    assigned_attacks: number;
    attacks_made: number;
    stars: number;
    last_observed_at: string | null;
    activity_score: number | null;
    performance_score: number | null;
    stars_per_attack: number | null;
    incomplete_wars: number;
  }>(activityResult.data).map((row) => [row.player_tag, row]));
  const observed = rows<{ player_tag: string; assigned_attacks: number }>(observedResult[0].data).map((row) => ({
    playerTag: row.player_tag,
    assignedAttacks: row.assigned_attacks,
  }));
  const attackEvidenceMembers = rows<{ player_tag: string; assigned_attacks: number }>(attackEvidenceResult[0].data);
  const observedAttackRows = rows<{ attacker_tag: string; stars: number }>(attackEvidenceResult[1].data);
  const currentWarAssignedAttacks = new Map(attackEvidenceMembers.map((row) => [row.player_tag, row.assigned_attacks]));
  const currentWarAttacksMade = new Map<string, number>();
  for (const attack of observedAttackRows) currentWarAttacksMade.set(attack.attacker_tag, (currentWarAttacksMade.get(attack.attacker_tag) ?? 0) + 1);
  const observedTags = new Set(observed.map((row) => row.playerTag));
  const members = rows<{ player_tag: string; name: string; town_hall_level: number }>(membersResult.data).map((member) => {
    const evidence = reliability.get(member.player_tag);
    return {
      playerTag: member.player_tag,
      name: member.name,
      townHallLevel: member.town_hall_level,
      role: roles.get(member.player_tag)?.role ?? "unknown",
      availability: availability.get(member.player_tag) ?? "unknown",
      assignedAttacks: evidence?.assigned_opportunities ?? 0,
      completedAttacks: evidence?.completed_assigned_attacks ?? 0,
      stars: stars.get(member.player_tag) ?? 0,
      observed: observedTags.has(member.player_tag),
      currentWarAssignedAttacks: currentWarAssignedAttacks.get(member.player_tag) ?? 0,
      currentWarAttacksMade: currentWarAttacksMade.get(member.player_tag) ?? 0,
      attackEvidenceWarDay: attackEvidenceWar?.war_day ?? null,
      regularWarsObserved: ratings.get(member.player_tag)?.regular_wars_observed ?? 0,
      regularWarsParticipated: ratings.get(member.player_tag)?.regular_wars_participated ?? 0,
      regularWarsIncomplete: activity.get(member.player_tag)?.incomplete_wars ?? 0,
      regularAssignedAttacks: ratings.get(member.player_tag)?.regular_assigned_attacks ?? 0,
      regularAttacksMade: ratings.get(member.player_tag)?.regular_attacks_made ?? 0,
      regularActivityScore: activity.get(member.player_tag)?.activity_score ?? ratings.get(member.player_tag)?.regular_activity_score ?? null,
      regularPerformanceScore: activity.get(member.player_tag)?.performance_score ?? ratings.get(member.player_tag)?.regular_performance_score ?? null,
      regularStarsPerAttack: activity.get(member.player_tag)?.stars_per_attack ?? ratings.get(member.player_tag)?.regular_stars_per_attack ?? null,
      regularLastObservedAt: activity.get(member.player_tag)?.last_observed_at ?? ratings.get(member.player_tag)?.regular_last_observed_at ?? null,
      overallRating: ratings.get(member.player_tag)?.overall_rating ?? null,
      cwlWarsParticipated: ratings.get(member.player_tag)?.cwl_wars_participated ?? 0,
      bonusPriorityScore: ratings.get(member.player_tag)?.bonus_priority_score ?? null,
    } satisfies CwlLineupMember;
  });

  const warDays = rows<{
    war_tag: string;
    war_day: number;
    state: string;
    preparation_start_time: string | null;
    start_time: string | null;
    end_time: string | null;
    updated_at: string | null;
  }>(warDaysResult.data).flatMap((row) => typeof row.war_day === "number" ? [{
    warDay: row.war_day,
    state: row.state === "preparation" || row.state === "inWar" || row.state === "warEnded" ? row.state : "unknown",
    preparationStartTime: row.preparation_start_time,
    startTime: row.start_time,
    endTime: row.end_time,
    updatedAt: row.updated_at,
  } satisfies CwlLineupWarDay] : []);

  const auditRows = rows<{ id: string; event_type: string; event_data: unknown; actor_id: string | null; occurred_at: string }>(auditResult.data);
  const actorIds = [...new Set(auditRows.map((event) => event.actor_id).filter((id): id is string => Boolean(id)))];
  const profilesResult = actorIds.length
    ? await client.from("profiles").select("id,display_name").in("id", actorIds)
    : { data: [], error: null };
  ensureSuccess(profilesResult, "Unable to load lineup history actors");
  const actorNames = new Map(rows<{ id: string; display_name: string }>(profilesResult.data).map((profile) => [profile.id, profile.display_name]));
  const history = auditRows.map((event) => ({
    id: event.id,
    eventType: event.event_type,
    label: historyLabel(event.event_type),
    actorName: event.actor_id ? actorNames.get(event.actor_id) ?? "Leader" : "System",
    occurredAt: event.occurred_at,
    eventData: record(event.event_data),
  }));
  if (typeof war.updated_at === "string") {
    history.push({
      id: `observed:${war.war_tag}`,
      eventType: "observed_lineup_refreshed",
      label: "Observed lineup refreshed",
      actorName: "Clash API",
      occurredAt: war.updated_at,
      eventData: {},
    });
  }
  history.sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));

  const collection = record(collectionResult.data);
  const refreshTimestamps = [
    typeof collection.last_fresh_at === "string" ? collection.last_fresh_at : null,
    ...availabilityRows.map((row) => typeof row.recorded_at === "string" ? row.recorded_at : null),
    ...roleRows.map((row) => typeof row.roster_observed_at === "string" ? row.roster_observed_at : null),
    typeof war.updated_at === "string" ? war.updated_at : null,
  ].filter((value): value is string => value !== null);
  const lastRefreshedAt = refreshTimestamps.sort((left, right) => right.localeCompare(left))[0] ?? null;

  return {
    season: { clanTag, seasonId, warSize: seasonResult.data.war_size },
    plan,
    members,
    observed,
    appliedBaseline,
    history: history.slice(0, 25),
    observedUpdatedAt: typeof war.updated_at === "string" ? war.updated_at : null,
    warDays,
    freshness: {
      lastRefreshedAt,
      collectionStatus: typeof collection.status === "string" ? collection.status : null,
    },
  };
}

export async function saveCwlLineupPlan(client: any, value: { clanTag: string; seasonId: string; warDay: number; expectedRevision: number; playerTags: string[] }): Promise<CwlDailyLineupPlan> {
  const result = await client.rpc("save_cwl_daily_lineup_plan", {
    requested_clan_tag: value.clanTag,
    requested_season_id: value.seasonId,
    requested_war_day: value.warDay,
    expected_revision: value.expectedRevision,
    requested_player_tags: value.playerTags,
  });
  ensureSuccess(result, "Unable to save the lineup plan");
  return planFromRpc(result.data);
}

export async function setCwlLineupPlanLock(client: any, value: { clanTag: string; seasonId: string; warDay: number; expectedRevision: number; isLocked: boolean }): Promise<CwlDailyLineupPlan> {
  const result = await client.rpc("set_cwl_daily_lineup_plan_lock", {
    requested_clan_tag: value.clanTag,
    requested_season_id: value.seasonId,
    requested_war_day: value.warDay,
    expected_revision: value.expectedRevision,
    requested_is_locked: value.isLocked,
  });
  ensureSuccess(result, "Unable to change the lineup lock");
  return planFromRpc(result.data);
}

export async function reinheritCwlLineupPlan(client: any, value: { clanTag: string; seasonId: string; warDay: number; expectedRevision: number }): Promise<CwlDailyLineupPlan> {
  const result = await client.rpc("reinherit_cwl_daily_lineup_plan", {
    requested_clan_tag: value.clanTag,
    requested_season_id: value.seasonId,
    requested_war_day: value.warDay,
    expected_revision: value.expectedRevision,
  });
  ensureSuccess(result, "Unable to re-inherit the lineup plan");
  return planFromRpc(result.data);
}

/* The three checklist mutations. Each returns the whole baseline rather than an
 * acknowledgement, because the client's next question is always "what is left
 * to do", and that is a replay the server already performs. */
export async function recordCwlAppliedLineupChange(client: any, value: {
  clanTag: string; seasonId: string; warDay: number; removedPlayerTag: string | null; addedPlayerTag: string | null;
}): Promise<CwlAppliedLineupBaseline> {
  const result = await client.rpc("record_cwl_applied_lineup_change", {
    requested_clan_tag: value.clanTag,
    requested_season_id: value.seasonId,
    requested_war_day: value.warDay,
    removed_player_tag: value.removedPlayerTag,
    added_player_tag: value.addedPlayerTag,
  });
  ensureSuccess(result, "Unable to record the change you made in game");
  return appliedBaselineFromRpc(result.data);
}

/* Any recorded act can be undone, not only the most recent one — so this takes
 * a sequence rather than popping. Undoing makes the instruction reappear. */
export async function undoCwlAppliedLineupChange(client: any, value: {
  clanTag: string; seasonId: string; warDay: number; changeSequence: number;
}): Promise<CwlAppliedLineupBaseline> {
  const result = await client.rpc("undo_cwl_applied_lineup_change", {
    requested_clan_tag: value.clanTag,
    requested_season_id: value.seasonId,
    requested_war_day: value.warDay,
    requested_change_sequence: value.changeSequence,
  });
  ensureSuccess(result, "Unable to undo that change");
  return appliedBaselineFromRpc(result.data);
}

/* Folds the confirmed acts into the base set: same baseline, no history. This
 * is the leader saying "the game and the plan agree now" without waiting for
 * collection to observe the war and say it for them. */
export async function clearCwlAppliedLineupChanges(client: any, value: {
  clanTag: string; seasonId: string; warDay: number;
}): Promise<CwlAppliedLineupBaseline> {
  const result = await client.rpc("clear_cwl_applied_lineup_changes", {
    requested_clan_tag: value.clanTag,
    requested_season_id: value.seasonId,
    requested_war_day: value.warDay,
  });
  ensureSuccess(result, "Unable to clear the checklist");
  return appliedBaselineFromRpc(result.data);
}

/* The review surface's only control (#54). It records whether the bonus medals
 * were handed out — never who received them — and the same flag is what tells
 * the CWL route it may rest (ADR 0002).
 *
 * A toggle rather than a one-way latch, because it is one tap at the end of a
 * season and a mistap has to be recoverable. Marking twice is idempotent
 * server-side: the instant says when the bonuses were handed out, and a second
 * tap is not a second handout. */
export async function setCwlBonusesAdministered(client: any, value: {
  clanTag: string; seasonId: string; administered: boolean;
}): Promise<CwlBonusAdministration> {
  const result = await client.rpc("set_cwl_bonuses_administered", {
    requested_clan_tag: value.clanTag,
    requested_season_id: value.seasonId,
    administered: value.administered,
  });
  ensureSuccess(result, "Unable to record whether the bonuses were handed out");
  return bonusAdministrationFromRpc(result.data);
}

function bonusAdministrationFromRpc(value: unknown): CwlBonusAdministration {
  const row = record(value);
  if (typeof row.clanTag !== "string" || typeof row.seasonId !== "string") {
    throw new Error("Bonus administration returned an invalid response.");
  }
  return {
    clanTag: row.clanTag,
    seasonId: row.seasonId,
    /* Absent evidence stays absent, and the absence is the answer here rather
     * than a missing field: null means "not handed out". A non-string is
     * therefore coerced to null rather than thrown on, unlike the two
     * identifiers above, which have no meaningful absent form. */
    bonusesAdministeredAt: typeof row.bonusesAdministeredAt === "string" ? row.bonusesAdministeredAt : null,
  };
}

function ensureSuccess(result: Result, context: string): void {
  if (result.error) throw new Error(`${context}: ${result.error.message}`);
}

async function currentUserId(client: any): Promise<string> {
  const result = await client.auth.getUser();
  ensureSuccess(result, "Unable to identify the current leader");
  if (!result.data.user) throw new Error("Authentication required.");
  return result.data.user.id;
}

export async function saveAvailability(client: any, value: {
  clanTag: string; seasonId: string; playerTag: string; status: "available" | "unavailable" | "unknown"; note: string;
}): Promise<void> {
  const userId = await currentUserId(client);
  const result = await client.from("member_availability").upsert({
    clan_tag: value.clanTag,
    season_id: value.seasonId,
    player_tag: value.playerTag,
    status: value.status,
    note: value.note || null,
    recorded_by: userId,
    recorded_at: new Date().toISOString(),
  }, { onConflict: "clan_tag,season_id,player_tag" });
  ensureSuccess(result, "Unable to save availability");
}

export async function createInvitation(client: InvitationClient, expiresAt: string): Promise<string> {
  const result = await client.rpc("create_invitation", { invitation_expires_at: expiresAt });
  ensureSuccess(result, "Unable to create invitation");
  if (!result.data) throw new Error("Invitation creation returned no token.");
  return result.data;
}

export async function loadAccessManagement(client: AccessManagementClient): Promise<AccessManagementSnapshot> {
  const result = await client.rpc("get_access_management_snapshot", { access_audit_limit: 50 });
  ensureSuccess(result, "Unable to load access management");
  if (!result.data) throw new Error("Access management returned no data.");
  return result.data;
}

export async function reissueInvitation(client: AccessManagementClient, invitationId: string, expiresAt: string): Promise<string> {
  const result = await client.rpc("reissue_invitation", { invitation_id: invitationId, invitation_expires_at: expiresAt });
  ensureSuccess(result, "Unable to reissue invitation");
  if (!result.data) throw new Error("Invitation reissue returned no token.");
  return result.data;
}

export async function revokeInvitation(client: AccessManagementClient, invitationId: string): Promise<void> {
  ensureSuccess(await client.rpc("revoke_invitation", { invitation_id: invitationId }), "Unable to revoke invitation");
}

export async function promoteLeader(client: AccessManagementClient, userId: string): Promise<void> {
  ensureSuccess(await client.rpc("promote_to_admin", { target_user_id: userId }), "Unable to promote leader");
}

export async function demoteAdmin(client: AccessManagementClient, userId: string): Promise<void> {
  ensureSuccess(await client.rpc("demote_to_leader", { target_user_id: userId }), "Unable to demote admin");
}

export async function revokeAccess(client: AccessManagementClient, userId: string): Promise<void> {
  ensureSuccess(await client.rpc("revoke_user_access", { target_user_id: userId }), "Unable to revoke access");
}

export async function approveRecommendation(client: any, recommendationId: string, finalChanges: unknown[]): Promise<void> {
  ensureSuccess(await client.rpc("record_leader_decision", {
    recommendation_id: recommendationId,
    decision_status: "approved",
    final_changes: finalChanges,
    decision_override_note: null,
  }), "Unable to approve recommendation");
}

export async function overrideRecommendation(client: any, recommendationId: string, finalChanges: unknown[], overrideNote: string): Promise<void> {
  ensureSuccess(await client.rpc("record_leader_decision", {
    recommendation_id: recommendationId,
    decision_status: "overridden",
    final_changes: finalChanges,
    decision_override_note: overrideNote,
  }), "Unable to override recommendation");
}

export async function regenerateRecommendations(
  client: RecommendationFunctionClient,
  clanTag: string,
): Promise<RecommendationRegenerationResult> {
  const result = await client.functions.invoke("regenerate-recommendations", {
    body: { clanTag },
  });
  ensureSuccess(result, "Unable to regenerate recommendations");
  if (!isRecommendationRegenerationResult(result.data)) {
    throw new Error("Recommendation regeneration returned an invalid response.");
  }
  return result.data;
}

function isRecommendationRegenerationResult(value: unknown): value is RecommendationRegenerationResult {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.status === "skipped") return candidate.reason === "no_active_cwl_context";
  return candidate.status === "persisted"
    && typeof candidate.recommendationId === "string"
    && typeof candidate.created === "boolean";
}
