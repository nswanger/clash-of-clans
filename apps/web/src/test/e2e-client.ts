const defaultTableData: Record<string, unknown> = {
  profiles: { display_name: "E2E Leader" },
  cwl_seasons: { clan_tag: "#E2E", season_id: "2026-07", war_size: 15 },
  cwl_wars: { war_tag: "#WAR3", war_day: 3, end_time: "2026-07-13T23:59:59.000Z", attacks_per_member: 1 },
  member_roster_overview: [
    { player_tag: "#MASON", role: "admin", roster_observed_at: "2026-07-12T17:56:00.000Z", is_current_member: true },
    { player_tag: "#SAM", role: "member", roster_observed_at: "2026-07-12T17:56:00.000Z", is_current_member: true },
    { player_tag: "#KIRA", role: "member", roster_observed_at: "2026-07-12T17:56:00.000Z", is_current_member: true },
  ],
  cwl_members: [
    { player_tag: "#MASON", name: "Mason", town_hall_level: 15 },
    { player_tag: "#SAM", name: "Sam", town_hall_level: 16 },
    { player_tag: "#KIRA", name: "Kira", town_hall_level: 14 },
  ],
  cwl_war_members: [{ player_tag: "#MASON", assigned_attacks: 1 }],
  cwl_attacks: [{ attacker_tag: "#MASON" }],
  member_availability: [
    { player_tag: "#MASON", status: "available" }, { player_tag: "#SAM", status: "available" }, { player_tag: "#KIRA", status: "unknown" },
  ],
  cwl_eight_star_eligibility: [
    { player_tag: "#MASON", stars: 8, eight_star_eligible: true }, { player_tag: "#SAM", stars: 5, eight_star_eligible: false }, { player_tag: "#KIRA", stars: 2, eight_star_eligible: false },
  ],
  collection_attempts: { run_id: "run-1" },
  collection_runs: { status: "healthy", last_fresh_at: "2026-07-12T17:56:00.000Z", error_message: null },
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
  const result = () => ({ data: tableData[table] ?? [], error: null });
  const query: any = {
    select: () => query, eq: () => query, in: () => query, order: () => query, limit: () => query,
    single: async () => result(), maybeSingle: async () => result(),
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

export function createE2EClient(): any {
  const acceptanceFixture = window.localStorage.getItem("e2e:cwl-acceptance-fixture");
  const tableData: Record<string, unknown> = acceptanceFixture ? JSON.parse(acceptanceFixture) : defaultTableData;
  const persistFixture = acceptanceFixture
    ? () => window.localStorage.setItem("e2e:cwl-acceptance-fixture", JSON.stringify(tableData))
    : undefined;
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
      recordMutation(`rpc:${name}`, args);
      return { data: null, error: null };
    },
  };
}
