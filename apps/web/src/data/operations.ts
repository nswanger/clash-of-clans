interface Result<T = unknown> { data?: T; error: { message: string } | null }

/* The recommendation readers left with `#/dashboard` (ADR 0002, #25 wave 3).
 * `approveRecommendation`, `overrideRecommendation`, `regenerateRecommendations`
 * and their client and result types had exactly one caller between them — the
 * daily dashboard — and ADR 0002 judged that content not worth a surface,
 * because it describes only the current CWL cycle. They are dead by the same
 * rule that took the six profile counters in wave 1: their only reader is gone.
 *
 * THE PIPELINE ITSELF IS UNTOUCHED. `recommendations`, the collector's
 * production of them, and the `regenerate-recommendations` edge function are all
 * still there and still running; what is deleted is the app's ability to read
 * and approve them, which is the surface ADR 0002 removed. Restoring a reader is
 * a new surface's decision, not a resurrection of this code.
 */

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

/* ---------------------------------------------------------------------------
 * Collection health (#9, ADR 0002)
 * ------------------------------------------------------------------------- */

/* One endpoint's outcome in the latest run. `errorCategory` is the coarse label
 * the collector persists — `normalization_error` is the one #9 was opened
 * about: it was recorded on every failed normalization and read by nothing,
 * which is why a members endpoint returning HTTP 200 and dropping 47 player
 * captures was diagnosable only by replaying the RPC by hand.
 *
 * The underlying message is NOT here, because it is not stored: the collector
 * pushes it onto `internalErrors` and the repository writes only the category.
 * Surfacing the category is what the schema can honestly support today, and it
 * is the difference between "something failed" and "normalization failed on the
 * members endpoint". */
export interface CollectionAttemptHealth {
  endpoint: string;
  status: string;
  httpStatus: number | null;
  errorCategory: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface CollectionHealth {
  runId: string | null;
  status: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  lastFreshAt: string | null;
  errorMessage: string | null;
  attempts: CollectionAttemptHealth[];
}

/* Moved to Admin from the deleted daily dashboard, which is where "is this data
 * trustworthy" belongs beside "who can see it" (ADR 0002). The latest run and
 * its attempts, and nothing historical: a run before the latest one cannot
 * change what the app is showing now, and a log of them is a different feature
 * from a health check. */
export async function loadCollectionHealth(client: any): Promise<CollectionHealth> {
  const runResult = await client.from("collection_runs")
    .select("id,status,started_at,finished_at,last_fresh_at,error_message")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  ensureSuccess(runResult, "Unable to load collection health");
  if (!runResult.data) {
    return { runId: null, status: null, startedAt: null, finishedAt: null, lastFreshAt: null, errorMessage: null, attempts: [] };
  }
  const run = record(runResult.data);
  const runId = String(run.id);

  const attemptsResult = await client.from("collection_attempts")
    .select("endpoint,status,http_status,error_category,started_at,finished_at")
    .eq("run_id", runId)
    .order("started_at");
  ensureSuccess(attemptsResult, "Unable to load collection attempts");

  return {
    runId,
    status: typeof run.status === "string" ? run.status : null,
    startedAt: typeof run.started_at === "string" ? run.started_at : null,
    finishedAt: typeof run.finished_at === "string" ? run.finished_at : null,
    lastFreshAt: typeof run.last_fresh_at === "string" ? run.last_fresh_at : null,
    errorMessage: typeof run.error_message === "string" ? run.error_message : null,
    attempts: attemptsFromEmbed(attemptsResult.data),
  };
}

/* One mapping for both readers: the Admin route queries `collection_attempts`
 * directly and the CWL loaders embed it under the run, and both need the same
 * row shape for the same predicate to judge it. */
function attemptsFromEmbed(value: unknown): CollectionAttemptHealth[] {
  return rows<{
    endpoint: string; status: string; http_status: number | null;
    error_category: string | null; started_at: string; finished_at: string | null;
  }>(value).map((row) => ({
    endpoint: typeof row.endpoint === "string" ? row.endpoint : "unknown endpoint",
    /* Absent evidence stays absent. An attempt with no recorded status is not
       a healthy one — it is an attempt we cannot read, which the surface marks
       rather than assumes away. */
    status: typeof row.status === "string" ? row.status : "unknown",
    httpStatus: typeof row.http_status === "number" ? row.http_status : null,
    errorCategory: typeof row.error_category === "string" ? row.error_category : null,
    startedAt: typeof row.started_at === "string" ? row.started_at : "",
    finishedAt: typeof row.finished_at === "string" ? row.finished_at : null,
  }));
}

/* BETWEEN SEASONS THE LEAGUE GROUP DOES NOT EXIST, and the Clash API says so
 * with a 404. The collector records that attempt as failed and the run as
 * `partial`, which is true — an endpoint did fail — so this is read as the
 * exception it is rather than rewritten at the source. `collection_runs.status`
 * stays a record of what happened; deciding what it means to a reader is this
 * function's job.
 *
 * The rule is `verify-collector.sh`'s, minus its final clause. The runbook also
 * requires the healthy player attempts to match the live clan member count,
 * which that script can check because it holds a Clash token and the browser
 * never will. What survives is the shape: ONE failure, and it is the league
 * group's 404. A second failed endpoint is not this situation and re-raises the
 * banner, which is the whole point of not simply ignoring league-group 404s. */
export function isExpectedIdleCwlPartial(health: Pick<CollectionHealth, "status" | "attempts">): boolean {
  if (health.status !== "partial") return false;
  const failing = health.attempts.filter((attempt) => attempt.status !== "healthy");
  const [failure] = failing;
  return failing.length === 1
    && failure?.endpoint === "league_group"
    && failure.httpStatus === 404
    && failure.errorCategory === "not_found"
    && health.attempts.some((attempt) => attempt.endpoint === "clan" && attempt.status === "healthy")
    && health.attempts.some((attempt) => attempt.endpoint === "members" && attempt.status === "healthy");
}

/* A run is healthy or it is not, and only the latter is drawn. Rows and surfaces
 * mark the exception, never the rule (#19) — a green "collection is fine" panel
 * is the happy-path banner the whole design budget exists to remove. `running`
 * is not a fault: it is a run that has not finished.
 *
 * ATTEMPTS ARE REQUIRED TO CLEAR A `partial`, never to condemn one. A caller
 * that passes none gets the status-only judgement, so a surface that cannot see
 * the attempts reports the fault it can see rather than assuming an absent
 * exception applies. */
export function isCollectionUnhealthy(health: Pick<CollectionHealth, "status"> & Partial<Pick<CollectionHealth, "attempts">>): boolean {
  if (health.status === null) return true;
  if (health.status === "healthy" || health.status === "running") return false;
  return !isExpectedIdleCwlPartial({ status: health.status, attempts: health.attempts ?? [] });
}

export type CwlAvailability = "available" | "unavailable" | "unknown";
export type CwlMemberRole = "leader" | "coLeader" | "elder" | "member" | "unknown";
export type CwlWarState = "preparation" | "inWar" | "warEnded" | "unknown";

/* A CWL season is seven war days. It is a property of the game rather than of
 * our data — a group of eight clans plays seven rounds — and it is a constant
 * because the API's `rounds` array is not collected: the collector reads the
 * league group for its member list and its war tags, never its round count.
 *
 * It has to be a constant rather than a count of the `cwl_wars` rows, which is
 * the whole point of naming it. A war day that was never collected leaves no
 * row at all, so counting rows makes logged equal total and the review phase's
 * coverage caveat silently never fires — on precisely the season it exists to
 * warn about. */
export const CWL_WAR_DAYS = 7;

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

/* ---------------------------------------------------------------------------
 * The post-CWL review phase (#54, #25 wave 3)
 * ------------------------------------------------------------------------- */

/* Just enough to decide which phase the CWL route opens in (ADR 0002). It is a
 * separate, tiny load rather than a field on the workspace snapshot because the
 * decision has to be made BEFORE either phase's own data is fetched — the
 * workspace snapshot is the lineup phase's data, and fetching it to discover
 * that the season is over is the stale-lineup defect the phase model fixes. */
/* `bonusesAdministeredAt` and each day's `endTime` are here because wave 4's
 * stand-down phase reads them. Wave 3 left them out on the grounds that
 * fetching the administered marker early would be "a field kept warm for a
 * caller that does not exist"; the caller exists now — it is the first two rungs
 * of `defaultCwlPhase`'s ladder — and the two columns cost nothing beyond the
 * queries this loader already makes. */
export interface CwlSeasonPhaseSnapshot {
  clanTag: string;
  seasonId: string;
  bonusesAdministeredAt: string | null;
  /* The season menu's honestly-disabled entries, which the stand-down phase
     carries as well as the review phase (#55). They cost nothing: the seasons
     query already runs, and this is the same query without its `limit(1)`. */
  earlierSeasonIds: string[];
  warDays: Array<{ warDay: number; state: CwlWarState; endTime: string | null }>;
}

/* One member's record on one ENDED war day. A war day that never reached
 * `warEnded` is absent from `cwl_completed_missed_attacks` entirely, so it
 * contributes no stars and no missed attack — that is coverage, not a clean
 * sheet, and the surface says so rather than averaging it in. */
export interface CwlReviewWarDay {
  warDay: number;
  inLineup: boolean;
  assignedAttacks: number;
  completedAttacks: number;
  stars: number;
}

export interface CwlReviewMember {
  playerTag: string;
  name: string;
  townHallLevel: number;
  role: CwlMemberRole;
  days: CwlReviewWarDay[];
  /* War days this member was assigned to that never reached `warEnded`. The
     panel's coverage caveat, and the reason a thin record is readable as thin
     rather than as a bad season. */
  unloggedWarDays: number;
}

export interface CwlReviewSeasonSnapshot {
  season: {
    clanTag: string;
    seasonId: string;
    warSize: number;
    bonusesAdministeredAt: string | null;
  };
  members: CwlReviewMember[];
  /* Seasons the clan has collected, newest first, EXCLUDING the one rendered.
     They exist and they are not reachable: every CWL view routes through
     `cwl_current_seasons`, so the menu lists them honestly disabled rather than
     pretending the clan has no history (ADR 0002). */
  earlierSeasonIds: string[];
  /* Both counts, because the difference between them IS the coverage caveat:
     "5 of 7 war days logged" is what the eyebrow states, and it is the only
     honest reading of every figure below it. */
  loggedWarDays: number;
  totalWarDays: number;
  freshness: {
    lastRefreshedAt: string | null;
    collectionStatus: string | null;
    /* Carried so the caveat can apply the idle-CWL exception, which is a fact
       about the run's attempts and not about its status. */
    collectionAttempts: CollectionAttemptHealth[];
  };
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
    /* Carried so the caveat can apply the idle-CWL exception, which is a fact
       about the run's attempts and not about its status. */
    collectionAttempts: CollectionAttemptHealth[];
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
    /* The attempts come back embedded rather than as a second round trip:
       the caveat needs them to tell an absent league group from a real
       fault, and they hang off the run by foreign key. */
    client.from("collection_runs").select("status,last_fresh_at,collection_attempts(endpoint,status,http_status,error_category,started_at,finished_at)").order("started_at", { ascending: false }).limit(1).maybeSingle(),
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
    state: warState(row.state),
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
      collectionAttempts: attemptsFromEmbed(collection.collection_attempts),
    },
  };
}

/* Two queries and no derivation beyond the season. The phase decision itself is
 * `defaultCwlPhase` in cwl/cwl-phase.ts, which is pure and tested there; this
 * only fetches what it reads. */
export async function loadCwlSeasonPhase(client: any, clanTag: string): Promise<CwlSeasonPhaseSnapshot> {
  /* Every season the clan has rather than only the latest, as the review
     loader already does: the head of the list is the current season and the
     rest are the season menu's entries. */
  const seasonResult = await client.from("cwl_seasons")
    .select("clan_tag,season_id,bonuses_administered_at")
    .eq("clan_tag", clanTag)
    .order("season_id", { ascending: false });
  ensureSuccess(seasonResult, "Unable to load the current CWL season");
  const seasonRows = rows<{ season_id: string }>(seasonResult.data);
  if (!seasonRows[0]) throw new Error("No CWL season is available.");
  const season = record(seasonRows[0]);
  const seasonId = String(season.season_id);

  const warsResult = await client.from("cwl_wars")
    .select("war_day,state,end_time")
    .eq("clan_tag", clanTag)
    .eq("season_id", seasonId)
    .order("war_day");
  ensureSuccess(warsResult, "Unable to load the CWL war states");

  return {
    clanTag,
    seasonId,
    bonusesAdministeredAt: typeof season.bonuses_administered_at === "string" ? season.bonuses_administered_at : null,
    earlierSeasonIds: seasonRows.slice(1).map((row) => String(row.season_id)),
    warDays: rows<{ war_day: number; state: string; end_time: string | null }>(warsResult.data)
      .flatMap((row) => typeof row.war_day === "number"
        ? [{
            warDay: row.war_day,
            state: warState(row.state),
            endTime: typeof row.end_time === "string" ? row.end_time : null,
          }]
        : []),
  };
}

function warState(value: unknown): CwlWarState {
  return value === "preparation" || value === "inWar" || value === "warEnded" ? value : "unknown";
}

/* The whole season, per member per ended war day.
 *
 * `cwl_completed_missed_attacks` is the assignment record and it is already
 * scoped to `warEnded`, so its rows ARE the logged days — which is why a member
 * who was in an unlogged war contributes nothing rather than a zero. Stars come
 * from `cwl_attacks` rather than `cwl_member_stars`, because the panel's war-day
 * record needs them per day and the view only totals them per season.
 *
 * `cwl_completed_missed_attacks` routes through `cwl_current_seasons`, which is
 * the latest season and nothing else. That is the data gap the season menu
 * reports honestly rather than hides: an earlier season is not queryable today,
 * and would want a season-parameterised source — the same shape of change #34
 * made for the roster's activity window. */
export async function loadCwlReviewSeason(client: any, clanTag: string): Promise<CwlReviewSeasonSnapshot> {
  /* Every season the clan has, not just the latest: the current one is the head
     of the list and the rest are the season menu's honestly-disabled entries. */
  const seasonResult = await client.from("cwl_seasons")
    .select("clan_tag,season_id,war_size,bonuses_administered_at")
    .eq("clan_tag", clanTag)
    .order("season_id", { ascending: false });
  ensureSuccess(seasonResult, "Unable to load the CWL seasons");
  const seasonRows = rows<{ season_id: string; war_size: number; bonuses_administered_at: string | null }>(seasonResult.data);
  const currentSeason = seasonRows[0];
  if (!currentSeason) throw new Error("No CWL season is available.");
  const season = record(currentSeason);
  const seasonId = String(season.season_id);

  const [membersResult, rosterResult, warsResult, assignmentResult, collectionResult] = await Promise.all([
    client.from("cwl_members").select("player_tag,name,town_hall_level").eq("clan_tag", clanTag).eq("season_id", seasonId).order("name"),
    client.from("member_roster_overview").select("player_tag,role").eq("clan_tag", clanTag).eq("is_current_member", true),
    client.from("cwl_wars").select("war_tag,war_day,state").eq("clan_tag", clanTag).eq("season_id", seasonId).order("war_day"),
    client.from("cwl_completed_missed_attacks")
      .select("war_day,player_tag,assigned_attacks,completed_assigned_attacks")
      .eq("clan_tag", clanTag).eq("season_id", seasonId),
    /* The attempts come back embedded rather than as a second round trip:
       the caveat needs them to tell an absent league group from a real
       fault, and they hang off the run by foreign key. */
    client.from("collection_runs").select("status,last_fresh_at,collection_attempts(endpoint,status,http_status,error_category,started_at,finished_at)").order("started_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  for (const [result, context] of [
    [membersResult, "Unable to load CWL members"],
    [rosterResult, "Unable to load current clan roles"],
    [warsResult, "Unable to load CWL war states"],
    [assignmentResult, "Unable to load the season attack record"],
  ] as Array<[Result, string]>) ensureSuccess(result, context);

  const warRows = rows<{ war_tag: string; war_day: number; state: string }>(warsResult.data);
  const endedWars = warRows.filter((row) => warState(row.state) === "warEnded");
  const warDayOfTag = new Map(endedWars.map((row) => [row.war_tag, row.war_day]));
  const loggedDays = [...new Set(endedWars.map((row) => row.war_day))].sort((left, right) => left - right);

  /* Skipped entirely when no war has ended: `.in()` on an empty list is a query
     that can only return nothing, and paying a round trip for it on a season
     that has not started is the phase model's own defect in miniature. */
  const attackResult = endedWars.length
    ? await client.from("cwl_attacks").select("war_tag,attacker_tag,stars").in("war_tag", endedWars.map((row) => row.war_tag))
    : { data: [], error: null };
  ensureSuccess(attackResult, "Unable to load the season attack record");

  const starsByDay = new Map<string, number>();
  for (const attack of rows<{ war_tag: string; attacker_tag: string; stars: number }>(attackResult.data)) {
    const warDay = warDayOfTag.get(attack.war_tag);
    if (warDay === undefined) continue;
    const key = `${attack.attacker_tag}:${warDay}`;
    starsByDay.set(key, (starsByDay.get(key) ?? 0) + (typeof attack.stars === "number" ? attack.stars : 0));
  }

  /* The coverage caveat's source. A war day that never ended is absent from
     `cwl_completed_missed_attacks` by construction, so the only way to know a
     member was IN one is to ask the assignment table directly. Skipped when
     every day ended, which is the ordinary case. */
  const unendedWarTags = warRows.filter((row) => warState(row.state) !== "warEnded").map((row) => row.war_tag);
  const unendedResult = unendedWarTags.length
    ? await client.from("cwl_war_members").select("player_tag").in("war_tag", unendedWarTags)
    : { data: [], error: null };
  ensureSuccess(unendedResult, "Unable to load unfinished war assignments");
  const unloggedByTag = new Map<string, number>();
  for (const row of rows<{ player_tag: string }>(unendedResult.data)) {
    unloggedByTag.set(row.player_tag, (unloggedByTag.get(row.player_tag) ?? 0) + 1);
  }

  const assignments = new Map<string, { assigned: number; completed: number }>();
  for (const row of rows<{ war_day: number; player_tag: string; assigned_attacks: number; completed_assigned_attacks: number }>(assignmentResult.data)) {
    assignments.set(`${row.player_tag}:${row.war_day}`, {
      assigned: row.assigned_attacks ?? 0,
      completed: row.completed_assigned_attacks ?? 0,
    });
  }

  const roles = new Map(rows<{ player_tag: string; role: string }>(rosterResult.data)
    .map((row) => [row.player_tag, normalizeClanRole(row.role)]));

  const members = rows<{ player_tag: string; name: string; town_hall_level: number }>(membersResult.data).map((member) => ({
    playerTag: member.player_tag,
    name: member.name,
    townHallLevel: member.town_hall_level,
    role: roles.get(member.player_tag) ?? "unknown",
    days: loggedDays.map((warDay) => {
      const assignment = assignments.get(`${member.player_tag}:${warDay}`);
      return {
        warDay,
        inLineup: assignment !== undefined,
        assignedAttacks: assignment?.assigned ?? 0,
        completedAttacks: assignment?.completed ?? 0,
        stars: starsByDay.get(`${member.player_tag}:${warDay}`) ?? 0,
      } satisfies CwlReviewWarDay;
    }),
    unloggedWarDays: unloggedByTag.get(member.player_tag) ?? 0,
  } satisfies CwlReviewMember));

  const collection = record(collectionResult.data);
  return {
    season: {
      clanTag,
      seasonId,
      warSize: typeof season.war_size === "number" ? season.war_size : 0,
      bonusesAdministeredAt: typeof season.bonuses_administered_at === "string" ? season.bonuses_administered_at : null,
    },
    members,
    earlierSeasonIds: seasonRows.slice(1).map((row) => row.season_id),
    loggedWarDays: loggedDays.length,
    /* The season's own length, NOT a count of the `cwl_wars` rows. A war day we
       never collected leaves no row, so counting rows would make logged equal
       total and the coverage caveat would go quiet on exactly the season it
       exists to warn about. `Math.max` rather than the bare constant so a group
       that somehow ran longer still reports honestly. */
    totalWarDays: Math.max(CWL_WAR_DAYS, warRows.length),
    freshness: {
      lastRefreshedAt: typeof collection.last_fresh_at === "string" ? collection.last_fresh_at : null,
      collectionStatus: typeof collection.status === "string" ? collection.status : null,
      collectionAttempts: attemptsFromEmbed(collection.collection_attempts),
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
