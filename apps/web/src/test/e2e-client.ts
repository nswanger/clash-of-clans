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

/* THE CWL SEASON IS DATED FROM THE CLOCK, NOT WRITTEN OUT.
 *
 * The phase ladder reads three time-dependent markers (ADR 0002, #55), so a
 * fixture with a written-out season is a fixture that changes phase as the
 * calendar advances: the wave-3 dates put the final war more than seven days in
 * the past, which is stand down, and the season id would have named an earlier
 * month from the 1st onwards, which is stand down again. The suite would have
 * gone red on a date rather than on a change.
 *
 * So the season is always the current month and the wars always ended
 * yesterday-ish, which is what "a current season with a live war day" MEANS.
 * Everything else in this file stays written out, because nothing else is read
 * against the clock. */
const fixtureNow = new Date();
/* `YYYY-MM-DD`, WHICH IS WHAT THE API ACTUALLY RETURNS (#91). This fixture
   emitted `YYYY-MM` until then, and that single wrong character is why two
   readers that could not parse a real season id shipped: every test in the
   suite ran against a shape production never produces. Checked against stored
   `raw_snapshots` for `league_group`, where `season` reads `"2026-08-01"`. */
function fixtureMonthId(monthsAgo: number): string {
  const month = new Date(Date.UTC(fixtureNow.getUTCFullYear(), fixtureNow.getUTCMonth() - monthsAgo, 1));
  return month.toISOString().slice(0, 10);
}
const fixtureSeasonId = fixtureMonthId(0);
/* The season menu's second entry, and the clan's history (#56). Dated from the
   clock for the same reason the current one is: a written-out previous season
   becomes the current month once the calendar reaches it. */
const fixturePreviousSeasonId = fixtureMonthId(1);
function fixtureWarTime(daysAgo: number): string {
  return new Date(fixtureNow.getTime() - daysAgo * 86400000).toISOString();
}

const defaultTableData: Record<string, unknown> = {
  profiles: { display_name: "E2E Leader" },
  /* A CURRENT season with a live war day, so the CWL route opens on the lineup
     phase. The phase markers are the war states with a date guard (ADR 0002)
     plus wave 4's two resting markers: the bonuses are not administered and the
     final war ended well inside the seven-day window, so neither fires. */
  /* TWO SEASONS, AND `season_id` IS MODELLED ON EVERY CWL TABLE BELOW (#56).
     Before #56 one season was the honest fixture, because the views were scoped
     to the latest season and a second one was not reachable. Now that a
     previous season IS queryable, a fixture carrying only the current one would
     let the season menu appear to work while every loader returned the current
     season's rows under the previous season's heading — which is precisely the
     defect the disabled menu entries existed to prevent. The stub's rule does
     the rest: a filter binds where the fixture models the column. */
  cwl_seasons: [
    { clan_tag: "#E2E", season_id: fixtureSeasonId, war_size: 15, bonuses_administered_at: null },
    { clan_tag: "#E2E", season_id: fixturePreviousSeasonId, war_size: 15, bonuses_administered_at: null },
  ],
  cwl_wars: [
    { season_id: fixtureSeasonId, war_tag: "#WAR1", war_day: 1, state: "warEnded", preparation_start_time: null, start_time: null, end_time: fixtureWarTime(2), updated_at: fixtureWarTime(2), attacks_per_member: 1 },
    { season_id: fixtureSeasonId, war_tag: "#WAR2", war_day: 2, state: "warEnded", preparation_start_time: null, start_time: null, end_time: fixtureWarTime(1), updated_at: fixtureWarTime(1), attacks_per_member: 1 },
    { season_id: fixtureSeasonId, war_tag: "#WAR3", war_day: 3, state: "inWar", preparation_start_time: null, start_time: null, end_time: fixtureWarTime(0), updated_at: fixtureWarTime(0), attacks_per_member: 1 },
    /* The previous season, complete: all seven days logged, so its review says
       nothing about coverage where the current season's says two of seven. That
       difference is what makes an assertion about which season is on screen an
       assertion rather than a coincidence. */
    ...[1, 2, 3, 4, 5, 6, 7].map((warDay) => ({
      season_id: fixturePreviousSeasonId, war_tag: `#PREVWAR${warDay}`, war_day: warDay, state: "warEnded",
      preparation_start_time: null, start_time: null,
      end_time: fixtureWarTime(30 + (7 - warDay)), updated_at: fixtureWarTime(30 + (7 - warDay)), attacks_per_member: 1,
    })),
  ],
  /* The review phase's assignment record. Already scoped to `warEnded` by the
     view, so days 1 and 2 only — day 3 contributes nothing at all, which is what
     the coverage caveat is about. */
  cwl_completed_missed_attacks: [
    { season_id: fixtureSeasonId, war_day: 1, player_tag: "#MASON", assigned_attacks: 1, completed_assigned_attacks: 1 },
    { season_id: fixtureSeasonId, war_day: 2, player_tag: "#MASON", assigned_attacks: 1, completed_assigned_attacks: 1 },
    { season_id: fixtureSeasonId, war_day: 1, player_tag: "#SAM", assigned_attacks: 1, completed_assigned_attacks: 1 },
    { season_id: fixtureSeasonId, war_day: 2, player_tag: "#SAM", assigned_attacks: 1, completed_assigned_attacks: 0 },
    /* Kira turned up last season and has not this one. A member whose record
       differs between the two is the only way a test can tell which season the
       page is actually rendering. */
    ...[1, 2, 3, 4, 5, 6, 7].map((warDay) => ({
      season_id: fixturePreviousSeasonId, war_day: warDay, player_tag: "#KIRA", assigned_attacks: 1, completed_assigned_attacks: 1,
    })),
  ],
  member_roster_overview: [
    fixtureMember("#MASON", "Mason", "admin", 1, 15),
    fixtureMember("#SAM", "Sam", "member", 2, 16),
    fixtureMember("#KIRA", "Kira", "coLeader", 3, 14),
  ],
  /* Empty, and dated from the clock rather than hard-coded (#96). The stand-down
     surface asks for the month `rollCallTargetMonth` names, so a fixed
     `"2026-09"` here would match on one month of the year and silently return
     nothing on the other eleven. Starting empty is also the state the surface is
     actually reached in: a leader opens stand down to RECORD the roll call. */
  cwl_roll_call: [] as Array<Record<string, unknown>>,
  cwl_members: [
    { season_id: fixtureSeasonId, player_tag: "#MASON", name: "Mason", town_hall_level: 15 },
    { season_id: fixtureSeasonId, player_tag: "#SAM", name: "Sam", town_hall_level: 16 },
    { season_id: fixtureSeasonId, player_tag: "#KIRA", name: "Kira", town_hall_level: 14 },
    { season_id: fixturePreviousSeasonId, player_tag: "#KIRA", name: "Kira", town_hall_level: 14 },
  ],
  cwl_war_members: [{ player_tag: "#MASON", assigned_attacks: 1 }],
  cwl_attacks: [
    { war_tag: "#WAR1", attacker_tag: "#MASON", stars: 3 },
    { war_tag: "#WAR2", attacker_tag: "#MASON", stars: 3 },
    { war_tag: "#WAR3", attacker_tag: "#MASON", stars: 3 },
    { war_tag: "#WAR1", attacker_tag: "#SAM", stars: 2 },
    /* Scoped by war tag rather than by season, which is how the loader reads
       them — so the previous season's attacks need only their own tags. */
    ...[1, 2, 3, 4, 5, 6, 7].map((warDay) => ({ war_tag: `#PREVWAR${warDay}`, attacker_tag: "#KIRA", stars: 2 })),
  ],
  cwl_member_stars: [
    { season_id: fixtureSeasonId, player_tag: "#MASON", stars: 8 },
    { season_id: fixtureSeasonId, player_tag: "#SAM", stars: 5 },
    { season_id: fixtureSeasonId, player_tag: "#KIRA", stars: 2 },
    { season_id: fixturePreviousSeasonId, player_tag: "#KIRA", stars: 14 },
  ],
  /* The rating, and the three bases it can be built from (#89). `season_id` is
     modelled because both loaders filter on it and the previous season must
     carry ITS OWN window -- a fixture where every season showed the same
     regular-war figures is the defect this models the fix for.

     Dated from the clock like everything else here, so the window bounds stay
     in the past however long the fixture lives.

     #MASON is blended: CWL attacks and regular wars both observed.
     #SAM is regular_only, which is the day-one case -- no assigned CWL attack
       yet, and a rating that exists anyway.
     #KIRA is a real ZERO, not a gap: six wars observed in the window and she
       joined none of them. Before #89 she had no row at all here. */
  cwl_member_overall_rating: [
    {
      season_id: fixtureSeasonId, player_tag: "#MASON",
      regular_window_from: fixtureWarTime(40), regular_window_to: fixtureWarTime(10),
      regular_window_from_basis: "previous_cwl_end",
      regular_wars_observed: 6, regular_wars_participated: 6, regular_available_attacks: 12,
      regular_assigned_attacks: 12, regular_attacks_made: 11, regular_stars: 30,
      regular_wars_incomplete: 0, regular_activity_score: 92, regular_performance_score: 91,
      regular_stars_per_attack: 2.73, regular_opportunity_score: 92, regular_quality_score: 91,
      regular_score: 92, regular_last_observed_at: fixtureWarTime(11),
      cwl_score: 100, rating_basis: "blended", overall_rating: 97,
      cwl_wars_participated: 3, bonus_priority_score: null,
    },
    {
      season_id: fixtureSeasonId, player_tag: "#SAM",
      regular_window_from: fixtureWarTime(40), regular_window_to: fixtureWarTime(10),
      regular_window_from_basis: "previous_cwl_end",
      regular_wars_observed: 6, regular_wars_participated: 2, regular_available_attacks: 12,
      regular_assigned_attacks: 4, regular_attacks_made: 4, regular_stars: 12,
      regular_wars_incomplete: 0, regular_activity_score: 100, regular_performance_score: 100,
      regular_stars_per_attack: 3, regular_opportunity_score: 33, regular_quality_score: 100,
      regular_score: 53, regular_last_observed_at: fixtureWarTime(14),
      cwl_score: null, rating_basis: "regular_only", overall_rating: 53,
      cwl_wars_participated: 1, bonus_priority_score: 40,
    },
    {
      season_id: fixtureSeasonId, player_tag: "#KIRA",
      regular_window_from: fixtureWarTime(40), regular_window_to: fixtureWarTime(10),
      regular_window_from_basis: "previous_cwl_end",
      regular_wars_observed: 6, regular_wars_participated: 0, regular_available_attacks: 12,
      regular_assigned_attacks: 0, regular_attacks_made: 0, regular_stars: 0,
      regular_wars_incomplete: 0, regular_activity_score: null, regular_performance_score: null,
      regular_stars_per_attack: null, regular_opportunity_score: 0, regular_quality_score: 0,
      regular_score: 0, regular_last_observed_at: null,
      cwl_score: null, rating_basis: "regular_only", overall_rating: 0,
      cwl_wars_participated: 0, bonus_priority_score: 10,
    },
    /* The previous season has no regular-war collection behind it, which is
       exactly production's 2026-08: the window predates the first collected
       regular war, so the rating falls back to CWL completion rather than
       scoring anybody zero on evidence that does not exist. */
    {
      season_id: fixturePreviousSeasonId, player_tag: "#KIRA",
      regular_window_from: fixtureWarTime(70), regular_window_to: fixtureWarTime(40),
      regular_window_from_basis: "fixed_30_days",
      regular_wars_observed: 0, regular_wars_participated: 0, regular_available_attacks: 0,
      regular_assigned_attacks: 0, regular_attacks_made: 0, regular_stars: 0,
      regular_wars_incomplete: 0, regular_activity_score: null, regular_performance_score: null,
      regular_stars_per_attack: null, regular_opportunity_score: null, regular_quality_score: null,
      regular_score: null, regular_last_observed_at: null,
      cwl_score: 86, rating_basis: "reliability_only", overall_rating: 86,
      cwl_wars_participated: 7, bonus_priority_score: null,
    },
  ],
  member_availability: [
    { player_tag: "#MASON", status: "available" }, { player_tag: "#SAM", status: "available" }, { player_tag: "#KIRA", status: "unknown" },
  ],
  cwl_eight_star_eligibility: [
    { season_id: fixtureSeasonId, player_tag: "#MASON", stars: 8, eight_star_eligible: true },
    { season_id: fixtureSeasonId, player_tag: "#SAM", stars: 5, eight_star_eligible: false },
    { season_id: fixtureSeasonId, player_tag: "#KIRA", stars: 2, eight_star_eligible: false },
    { season_id: fixturePreviousSeasonId, player_tag: "#KIRA", stars: 14, eight_star_eligible: true },
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
  const embeds: string[] = [];
  /* Join an embedded child onto its parent row the way PostgREST does. The
     foreign key is named per embed rather than derived from the table name,
     because `collection_attempts.run_id` does not follow from
     `collection_runs` by any rule worth guessing at. An embed this map does not
     know is left absent rather than invented, which fails loudly in the test
     that needs it instead of quietly returning the wrong rows. */
  const embedForeignKeys: Record<string, string> = { collection_attempts: "run_id" };
  const withEmbeds = (row: unknown) => {
    if (!row || typeof row !== "object" || embeds.length === 0) return row;
    const parent = row as Record<string, unknown>;
    const joined: Record<string, unknown> = { ...parent };
    for (const embed of embeds) {
      const childRows = tableData[embed];
      const foreignKey = embedForeignKeys[embed];
      if (!Array.isArray(childRows) || !foreignKey) continue;
      joined[embed] = childRows.filter((child) => child && typeof child === "object"
        && (child as Record<string, unknown>)[foreignKey] === parent.id);
    }
    return joined;
  };
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
    return { data: withEmbeds(Array.isArray(data) ? data[0] ?? null : data), error: null };
  };
  const query: any = {
    /* THE FIELD LIST IS IGNORED EXCEPT FOR EMBEDS. A plain column list changes
       nothing here — the fixture row is returned whole — but an embedded
       resource is a join the fixture has to perform, and a stub that quietly
       dropped it would hand the caveat an empty attempts list and make an idle
       CWL run read as a fault on exactly the surface this models. */
    select: (fields?: string) => {
      const embedded = typeof fields === "string" ? fields.match(/([a-z_]+)\(/g) ?? [] : [];
      for (const match of embedded) embeds.push(match.slice(0, -1));
      return query;
    },
    eq: (column: string, value: unknown) => { filters.push({ column, match: (candidate) => candidate === value }); return query; },
    in: (column: string, values: unknown[]) => { filters.push({ column, match: (candidate) => values.includes(candidate) }); return query; },
    order: () => query, limit: () => query,
    single: async () => firstRow(), maybeSingle: async () => firstRow(),
    upsert: async (value: unknown) => {
      if (table === "cwl_roll_call" && Array.isArray(tableData[table]) && value !== null && typeof value === "object") {
        const rows = tableData[table] as Array<Record<string, unknown>>;
        const entry = value as Record<string, unknown>;
        tableData[table] = rows.some((row) => row.player_tag === entry.player_tag)
          ? rows
          : [...rows, entry];
        persistFixture?.();
        recordMutation("roll-call", value);
        return { error: null };
      }
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
    /* CHAINABLE, because an untick filters on clan, month and player where the
       one existing caller filtered on a single column. It resolves on `await`
       rather than on the first `eq`, which is what Supabase does and what the
       old one-shot shape could not model. */
    delete: () => {
      const removedValues: unknown[] = [];
      const removal: any = {
        eq: (column: string, value: unknown) => { removedValues.push(value); filters.push({ column, match: (candidate) => candidate === value }); return removal; },
        then: (resolve: (outcome: unknown) => void) => {
          if (table === "cwl_roll_call" && Array.isArray(tableData[table])) {
            const kept = (tableData[table] as Array<Record<string, unknown>>)
              .filter((row) => !filters.every((filter) => filter.match(row[filter.column])));
            tableData[table] = kept;
            persistFixture?.();
            recordMutation("roll-call", { removed: true });
          } else {
            /* The value, as before, not the columns: the one existing caller
               filters on the token it is revoking and a stub that recorded the
               column name instead would quietly weaken any test that reads it. */
            recordMutation("revoke", removedValues[removedValues.length - 1]);
          }
          resolve({ error: null });
        },
      };
      return removal;
    },
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
        /* By requested season, not "the season": the review surface can be
           looking at a previous one (#56), and marking its bonuses administered
           must not write through to the current season's row. */
        const seasons = tableData.cwl_seasons as Array<Record<string, unknown>>;
        const season = seasons.find((row) => String(row.season_id) === String(args.requested_season_id)) ?? seasons[0];
        if (!season) return { data: null, error: { message: "No CWL season is available." } };
        season.bonuses_administered_at = args.administered ? fixtureNow.toISOString() : null;
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
      /* The seed reports what it did and writes nothing here (#96): the fixture's
         availability is already what a seeded season looks like, and the stub
         models the REPORT because that is what the workspace renders. Null
         `rollCallAt` is the ordinary case — no roll call was taken — and it is
         what keeps the provenance line off the surface unless a test puts a roll
         call in the fixture. */
      if (name === "seed_cwl_roll_call") {
        const entries = (tableData.cwl_roll_call ?? []) as Array<Record<string, unknown>>;
        const known = new Set((tableData.cwl_members as Array<Record<string, unknown>> ?? []).map((row) => String(row.player_tag)));
        recordMutation(`rpc:${name}`, args);
        return {
          data: {
            seeded: entries.filter((entry) => known.has(String(entry.player_tag))).length,
            unmatched: entries.filter((entry) => !known.has(String(entry.player_tag))).map((entry) => String(entry.player_tag)),
            rollCallAt: entries.length ? String(entries[0]?.recorded_at ?? fixtureNow.toISOString()) : null,
          },
          error: null,
        };
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
