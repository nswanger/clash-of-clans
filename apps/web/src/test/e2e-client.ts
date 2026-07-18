const defaultTableData: Record<string, unknown> = {
  profiles: { display_name: "E2E Leader" },
  cwl_seasons: { clan_tag: "#E2E", season_id: "2026-07", war_size: 15 },
  cwl_wars: { war_tag: "#WAR3", war_day: 3, end_time: "2026-07-13T23:59:59.000Z", attacks_per_member: 1 },
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
  user_roles: [
    { user_id: "e2e-user", role: "admin", profiles: { display_name: "E2E Leader" } },
    { user_id: "other-leader", role: "leader", profiles: { display_name: "Other Leader" } },
  ],
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
    rpc: async (name: string, args: unknown) => {
      if (name === "has_app_role") return { data: true, error: null };
      if (name === "create_invitation") return { data: "e2e-one-time-token", error: null };
      recordMutation(`rpc:${name}`, args);
      return { data: null, error: null };
    },
  };
}
