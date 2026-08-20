/* The columns `loadMemberRoster` actually names. The profile counters and the
 * three baselines left the query with the counter-diff activity window (#34). */
function fixtureMember(playerTag: string, name: string, role: string, clanRank: number, townHallLevel: number) {
  return {
    clan_tag: "#E2E", player_tag: playerTag, name, role, clan_rank: clanRank,
    town_hall_level: townHallLevel, league_name: "Legend League",
    donations: 250, donations_received: 100, war_preference: "in",
    roster_observed_at: "2026-07-12T17:56:00.000Z", profile_observed_at: "2026-07-12T17:56:30.000Z",
    first_observed_present_on: "2026-07-01", is_current_member: true,
    current_presence_started_on: "2026-07-01", departure_observed_on: null,
  };
}

/* `regular_war_member_activity_window` rows for the same three members: two
 * with observed attacks, one who was in the clan for both logged wars and
 * appears in neither. `wars_observed` repeats on every row because it is the
 * clan's count for the window, not the member's. */
function fixtureWarActivity(playerTag: string, warsParticipated: number, attacksMade: number, stars: number) {
  return {
    clan_tag: "#E2E", player_tag: playerTag, window_days: 7,
    window_started_at: "2026-07-05T17:56:00.000Z", wars_observed: 2,
    wars_participated: warsParticipated, assigned_attacks: warsParticipated * 2,
    attacks_made: attacksMade, stars, last_observed_at: "2026-07-11T23:59:59.000Z",
    activity_score: null, performance_score: null, stars_per_attack: null, incomplete_wars: 0,
  };
}

const defaultTableData: Record<string, unknown> = {
  profiles: { display_name: "E2E Leader" },
  /* A CURRENT season with a live war day, so the CWL route opens on the lineup
     phase. The phase marker is the war states with a date guard (ADR 0002): a
     season id naming an earlier month reads as review no matter what the states
     say, which is the guard doing its job and not something to fixture around. */
  cwl_seasons: { clan_tag: "#E2E", season_id: "2026-08", war_size: 15, bonuses_administered_at: null },
  cwl_wars: [
    { war_tag: "#WAR1", war_day: 1, state: "warEnded", preparation_start_time: null, start_time: null, end_time: "2026-08-11T23:59:59.000Z", updated_at: "2026-08-12T00:00:00.000Z", attacks_per_member: 1 },
    { war_tag: "#WAR2", war_day: 2, state: "warEnded", preparation_start_time: null, start_time: null, end_time: "2026-08-12T23:59:59.000Z", updated_at: "2026-08-13T00:00:00.000Z", attacks_per_member: 1 },
    { war_tag: "#WAR3", war_day: 3, state: "inWar", preparation_start_time: null, start_time: null, end_time: "2026-08-13T23:59:59.000Z", updated_at: "2026-08-13T06:00:00.000Z", attacks_per_member: 1 },
  ],
  /* The review phase's assignment record. Already scoped to `warEnded` by the
     view, so days 1 and 2 only — day 3 contributes nothing at all, which is what
     the coverage caveat is about. */
  cwl_completed_missed_attacks: [
    { war_day: 1, player_tag: "#MASON", assigned_attacks: 1, completed_assigned_attacks: 1 },
    { war_day: 2, player_tag: "#MASON", assigned_attacks: 1, completed_assigned_attacks: 1 },
    { war_day: 1, player_tag: "#SAM", assigned_attacks: 1, completed_assigned_attacks: 1 },
    { war_day: 2, player_tag: "#SAM", assigned_attacks: 1, completed_assigned_attacks: 0 },
  ],
  member_roster_overview: [
    fixtureMember("#MASON", "Mason", "admin", 1, 15),
    fixtureMember("#SAM", "Sam", "member", 2, 16),
    fixtureMember("#KIRA", "Kira", "coLeader", 3, 14),
  ],
  cwl_members: [
    { player_tag: "#MASON", name: "Mason", town_hall_level: 15 },
    { player_tag: "#SAM", name: "Sam", town_hall_level: 16 },
    { player_tag: "#KIRA", name: "Kira", town_hall_level: 14 },
  ],
  cwl_war_members: [{ player_tag: "#MASON", assigned_attacks: 1 }],
  cwl_attacks: [
    { war_tag: "#WAR1", attacker_tag: "#MASON", stars: 3 },
    { war_tag: "#WAR2", attacker_tag: "#MASON", stars: 3 },
    { war_tag: "#WAR3", attacker_tag: "#MASON", stars: 3 },
    { war_tag: "#WAR1", attacker_tag: "#SAM", stars: 2 },
  ],
  cwl_member_stars: [
    { player_tag: "#MASON", stars: 8 }, { player_tag: "#SAM", stars: 5 }, { player_tag: "#KIRA", stars: 2 },
  ],
  member_availability: [
    { player_tag: "#MASON", status: "available" }, { player_tag: "#SAM", status: "available" }, { player_tag: "#KIRA", status: "unknown" },
  ],
  cwl_eight_star_eligibility: [
    { player_tag: "#MASON", stars: 8, eight_star_eligible: true }, { player_tag: "#SAM", stars: 5, eight_star_eligible: false }, { player_tag: "#KIRA", stars: 2, eight_star_eligible: false },
  ],
  /* The row shape the Admin route's collection health actually reads, not just
     the `run_id` the deleted dashboard needed to find the run. */
  collection_attempts: [
    { run_id: "run-1", endpoint: "clan", status: "healthy", http_status: 200, error_category: null, started_at: "2026-08-13T06:00:00.000Z", finished_at: "2026-08-13T06:00:30.000Z" },
    { run_id: "run-1", endpoint: "members", status: "healthy", http_status: 200, error_category: null, started_at: "2026-08-13T06:00:30.000Z", finished_at: "2026-08-13T06:01:00.000Z" },
  ],
  collection_runs: { id: "run-1", status: "healthy", started_at: "2026-08-13T06:00:00.000Z", finished_at: "2026-08-13T06:01:00.000Z", last_fresh_at: "2026-08-13T06:01:00.000Z", error_message: null },
  recommendations: { id: "30000000-0000-0000-0000-000000000001", output: {
    changes: [{ outPlayerTag: "#MASON", inPlayerTag: "#SAM", reasons: [{ code: "missed_attack", explanation: "Missed the assigned attack on Day 2" }] }],
    contacts: [{ playerTag: "#KIRA", reason: "Availability is unknown" }], coverageGaps: [], confidenceNotes: [],
  } },
  cwlLineupPlans: {},
  user_roles: [
    { user_id: "e2e-user", role: "admin", profiles: { display_name: "E2E Leader" } },
    { user_id: "other-leader", role: "leader", profiles: { display_name: "Other Leader" } },
  ],
};

const accessManagementSnapshot = {
  people: [
    { id: "e2e-user", name: "E2E Leader", role: "admin", isCurrentUser: true },
    { id: "other-leader", name: "Other Leader", role: "leader", isCurrentUser: false },
  ],
  invitations: [{
    id: "e2e-invitation",
    status: "pending",
    createdAt: "2026-07-20T12:00:00.000Z",
    expiresAt: "2026-07-21T12:00:00.000Z",
    createdByName: "E2E Leader",
    usedAt: null,
    usedByName: null,
    revokedAt: null,
    revokedByName: null,
    reissuedFromId: null,
    reissuedInvitationId: null,
  }],
  auditEvents: [{
    id: "e2e-access-event",
    eventType: "invitation_created",
    actorName: "E2E Leader",
    targetName: null,
    eventData: {},
    occurredAt: "2026-07-20T12:00:00.000Z",
  }],
};

function recordMutation(name: string, value: unknown) {
  window.localStorage.setItem("e2e:last-mutation", JSON.stringify({ name, value }));
}

function builder(table: string, tableData: Record<string, unknown>, persistFixture?: () => void): any {
  /* `eq` and `in` USED TO BE NO-OPS, and that is a fixture that lies rather than
     one that is merely thin. `cwl_attacks` is the case that exposed it: the
     lineup workspace scopes it to the current war tag and the review phase reads
     every logged day, so an unfiltered table hands the workspace all three wars'
     attacks and Mason's row reads "3/1 attacks" — three attacks against one
     assigned, which no real war can produce.

     A filter applies only when at least one row in the table actually carries
     the column. The fixtures are written as the columns each loader selects, so
     several omit scoping columns their query still names — `cwl_members` rows
     have no `clan_tag` — and filtering on an absent column would empty the table
     instead of narrowing it. Ignoring those keeps a thin fixture thin, while a
     column the fixture does model is honoured. */
  const filters: Array<{ column: string; match: (value: unknown) => boolean }> = [];
  const applyFilters = (data: unknown) => {
    if (!Array.isArray(data)) return data;
    return data.filter((row) => filters.every((filter) => {
      if (!row || typeof row !== "object") return true;
      const modelled = data.some((candidate) => candidate && typeof candidate === "object" && filter.column in candidate);
      if (!modelled) return true;
      return filter.match((row as Record<string, unknown>)[filter.column]);
    }));
  };
  const result = () => ({ data: applyFilters(tableData[table] ?? []), error: null });
  /* `maybeSingle` and `single` return ONE row in Supabase, and the stub used to
     hand back the whole table — which worked only while every singly-read table
     was fixtured as a bare object. `cwl_wars` is a list now, because the phase
     marker reads every day's state. */
  const firstRow = () => {
    const data = applyFilters(tableData[table] ?? null);
    return { data: Array.isArray(data) ? data[0] ?? null : data, error: null };
  };
  const query: any = {
    select: () => query,
    eq: (column: string, value: unknown) => { filters.push({ column, match: (candidate) => candidate === value }); return query; },
    in: (column: string, values: unknown[]) => { filters.push({ column, match: (candidate) => values.includes(candidate) }); return query; },
    order: () => query, limit: () => query,
    single: async () => firstRow(), maybeSingle: async () => firstRow(),
    upsert: async (value: unknown) => {
      if (table === "member_availability" && Array.isArray(tableData[table]) && value !== null && typeof value === "object") {
        const rows = tableData[table] as Array<Record<string, unknown>>;
        const upsertValue = value as Record<string, unknown>;
        const existingIndex = rows.findIndex((row) => row.player_tag === upsertValue.player_tag);
        tableData[table] = existingIndex === -1
          ? [...rows, upsertValue]
          : rows.map((row, index) => index === existingIndex ? { ...row, ...upsertValue } : row);
        persistFixture?.();
      }
      recordMutation("availability", value);
      return { error: null };
    },
    insert: async (value: unknown) => { recordMutation(`insert:${table}`, value); return { error: null }; },
    delete: () => ({ eq: async (_column: string, value: string) => { recordMutation("revoke", value); return { error: null }; } }),
    then: (resolve: (value: unknown) => void) => resolve(result()),
  };
  return query;
}

/* THE DEFAULT FIXTURE PERSISTS TOO, and it has to for the checklist to be
 * testable at all. `cwl_applied_lineup_baselines` exists because a half-applied
 * change set is a fact about the clan's war rather than about one device (#36),
 * so the assertion that matters is that a checked-off swap is still checked off
 * after a reload. Against in-memory state that assertion cannot fail, because
 * the reload takes the fixture back to its starting position along with it.
 *
 * Each Playwright test gets a fresh browser context, so this persists within a
 * test and never across one. */
const DEFAULT_FIXTURE_KEY = "e2e:fixture";

export function createE2EClient(): any {
  const acceptanceFixture = window.localStorage.getItem("e2e:cwl-acceptance-fixture");
  const storedDefault = acceptanceFixture ? null : window.localStorage.getItem(DEFAULT_FIXTURE_KEY);
  const tableData: Record<string, unknown> = acceptanceFixture
    ? JSON.parse(acceptanceFixture)
    : storedDefault
      ? JSON.parse(storedDefault)
      : defaultTableData;
  const persistFixture = acceptanceFixture
    ? () => window.localStorage.setItem("e2e:cwl-acceptance-fixture", JSON.stringify(tableData))
    : () => window.localStorage.setItem(DEFAULT_FIXTURE_KEY, JSON.stringify(tableData));
  return {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: "e2e-user" } } }, error: null }),
      getUser: async () => ({ data: { user: { id: "e2e-user" } }, error: null }),
      signInWithOAuth: async () => ({ error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
    from: (table: string) => builder(table, tableData, persistFixture),
    functions: {
      invoke: async (name: string, options: unknown) => {
        recordMutation(`function:${name}`, options);
        return {
          data: {
            status: "persisted",
            recommendationId: "30000000-0000-0000-0000-000000000001",
            created: false,
          },
          error: null,
        };
      },
    },
    rpc: async (name: string, args: any) => {
      if (name === "has_app_role") return { data: true, error: null };
      if (name === "regular_war_member_activity_window") {
        return {
          data: [
            fixtureWarActivity("#MASON", 2, 4, 9),
            fixtureWarActivity("#SAM", 1, 2, 4),
            fixtureWarActivity("#KIRA", 0, 0, 0),
          ],
          error: null,
        };
      }
      if (name === "set_cwl_bonuses_administered") {
        const season = tableData.cwl_seasons as Record<string, unknown>;
        season.bonuses_administered_at = args.administered ? "2026-08-20T10:00:00.000Z" : null;
        persistFixture?.();
        recordMutation(`rpc:${name}`, args);
        return { data: { clanTag: "#E2E", seasonId: String(season.season_id), bonusesAdministeredAt: season.bonuses_administered_at }, error: null };
      }
      if (name === "create_invitation") return { data: "e2e-one-time-token", error: null };
      if (name === "get_access_management_snapshot") return { data: accessManagementSnapshot, error: null };
      if (name === "ensure_cwl_daily_lineup_plan" || name === "save_cwl_daily_lineup_plan" || name === "set_cwl_daily_lineup_plan_lock" || name === "reinherit_cwl_daily_lineup_plan") {
        const day = Number(args.requested_war_day);
        const plans = (tableData.cwlLineupPlans ?? {}) as Record<string, any>;
        if (!plans[String(day)]) {
          const prior = day > 1 ? plans[String(day - 1)] : undefined;
          plans[String(day)] = {
            clanTag: "#E2E", seasonId: "2026-07", warDay: day, revision: 1, isLocked: false,
            lockedAt: null, lockedBy: null, inheritedFromWarDay: prior ? day - 1 : null,
            createdAt: "2026-07-12T08:00:00.000Z", createdBy: "e2e-user", updatedAt: "2026-07-12T08:00:00.000Z", updatedBy: "e2e-user",
            playerTags: prior ? [...prior.playerTags] : ["#MASON"],
          };
          tableData.cwlLineupPlans = plans;
        }
        const plan = plans[String(day)];
        if (name === "save_cwl_daily_lineup_plan") {
          plan.playerTags = [...args.requested_player_tags];
          plan.revision += 1;
          plan.updatedAt = "2026-07-12T18:00:00.000Z";
        } else if (name === "set_cwl_daily_lineup_plan_lock") {
          plan.isLocked = args.requested_is_locked;
          plan.revision += 1;
          plan.lockedAt = plan.isLocked ? "2026-07-12T18:00:00.000Z" : null;
          plan.lockedBy = plan.isLocked ? "e2e-user" : null;
        } else if (name === "reinherit_cwl_daily_lineup_plan" && day > 1) {
          const prior = plans[String(day - 1)];
          plan.playerTags = prior ? [...prior.playerTags] : [];
          plan.revision += 1;
          plan.inheritedFromWarDay = day - 1;
        }
        persistFixture?.();
        recordMutation(`rpc:${name}`, args);
        return { data: plan, error: null };
      }
      /* The applied-lineup baseline (#36): what the game is known to hold, as a
       * base member set plus the ordered acts a leader confirmed over it. The
       * fixture replays them the way the SQL function does, because the whole
       * point of the checklist is that the replay is what survives a reload. */
      if (name.endsWith("_cwl_applied_lineup") || name.includes("cwl_applied_lineup_change")) {
        const day = Number(args.requested_war_day);
        const plans = (tableData.cwlLineupPlans ?? {}) as Record<string, any>;
        const baselines = (tableData.cwlAppliedBaselines ?? {}) as Record<string, any>;
        if (!baselines[String(day)]) {
          baselines[String(day)] = {
            warDay: day, revision: 1, baseSource: "plan",
            basePlayerTags: [...(plans[String(day)]?.playerTags ?? [])],
            appliedChanges: [],
          };
          tableData.cwlAppliedBaselines = baselines;
        }
        const baseline = baselines[String(day)];
        if (name === "record_cwl_applied_lineup_change") {
          baseline.appliedChanges = [...baseline.appliedChanges, {
            changeSequence: baseline.appliedChanges.length + 1,
            removedPlayerTag: args.removed_player_tag ?? null,
            addedPlayerTag: args.added_player_tag ?? null,
            appliedAt: "2026-07-12T18:30:00.000Z",
          }];
          baseline.revision += 1;
        } else if (name === "undo_cwl_applied_lineup_change") {
          baseline.appliedChanges = baseline.appliedChanges.filter((change: any) => change.changeSequence !== args.requested_change_sequence);
          baseline.revision += 1;
        } else if (name === "clear_cwl_applied_lineup_changes") {
          baseline.basePlayerTags = replayBaseline(baseline);
          baseline.appliedChanges = [];
          baseline.baseSource = "confirmed";
          baseline.revision += 1;
        }
        persistFixture?.();
        recordMutation(`rpc:${name}`, args);
        return { data: { ...baseline, playerTags: replayBaseline(baseline) }, error: null };
      }
      recordMutation(`rpc:${name}`, args);
      return { data: null, error: null };
    },
  };
}

/* Replay tolerates halves it cannot carry out, exactly as the SQL does: any act
 * can be undone, not only the most recent, so a later change may name a member
 * an undone change had moved. */
function replayBaseline(baseline: { basePlayerTags: string[]; appliedChanges: Array<{ removedPlayerTag: string | null; addedPlayerTag: string | null }> }): string[] {
  let tags = [...baseline.basePlayerTags];
  for (const change of baseline.appliedChanges) {
    if (change.removedPlayerTag) tags = tags.filter((tag) => tag !== change.removedPlayerTag);
    if (change.addedPlayerTag && !tags.includes(change.addedPlayerTag)) tags.push(change.addedPlayerTag);
  }
  return [...tags].sort();
}
