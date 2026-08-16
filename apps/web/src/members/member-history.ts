/* Roster facts and observed war activity for the members surface.
 *
 * The activity window reads our own logged war history, not Clash's profile
 * counters (#34, #25 wave 1). `activityWindow()` used to diff donations, attack
 * wins and Capital contributions against a snapshot from N days ago; a counter
 * that moved tells you someone opened the game, and this roster is read to
 * decide who turns up for a war. `regular_war_member_activity_window` reports
 * what a member was observed doing in wars we logged, which is the question.
 *
 * The cost is accepted knowingly: war history only accumulates forward from the
 * day collection started, so early windows are thin and more members read as
 * having no evidence yet. "Building history" changed meaning with the source —
 * it now says we logged no war in this window, rather than that we hold no
 * snapshot from N days ago.
 */

export interface MemberRosterMember {
  clanTag: string;
  playerTag: string;
  name: string;
  role: string | null;
  clanRank: number | null;
  townHallLevel: number | null;
  leagueName: string | null;
  donations: number | null;
  donationsReceived: number | null;
  warPreference: string | null;
  rosterObservedAt: string;
  profileObservedAt: string | null;
  firstObservedPresentOn: string;
  isCurrentMember: boolean;
  currentPresenceStartedOn: string | null;
  departureObservedOn: string | null;
}

/* One member's participation in the wars that ended inside the window.
 *
 * `warsObserved` is the clan's war count for the same period and repeats on
 * every row — "joined 3 of 5" is only true when both halves cover the same
 * days. `incompleteWars` is a coverage gap to report, not a penalty. */
export interface MemberWarActivity {
  playerTag: string;
  windowDays: number;
  warsObserved: number;
  warsParticipated: number;
  assignedAttacks: number;
  attacksMade: number;
  stars: number;
  incompleteWars: number;
}

/* Three states, and the middle one is not "inactive".
 *
 * - `unknown`  — no war we logged ended in this window, so there is no evidence
 *                either way.
 * - `observed` — they attacked in a war we logged.
 * - `none`     — wars were logged and no attack of theirs was among them. Real
 *                evidence of absence from those wars, and nothing more: nobody
 *                is in every war. */
export type ActivityStatus = "observed" | "none" | "unknown";

/* The roster view's own columns, named rather than `*`.
 *
 * `baseline_1d` / `baseline_7d` / `baseline_30d`, `previous_clan_rank`,
 * `war_stars`, `last_observed_present_on` are gone with the counter diff that
 * was their only reader, and so are `trophies`, `league_id`, `attack_wins`,
 * `defense_wins`, `clan_capital_contributions` and `clan_games_points` — those
 * six were fetched on every roster load and never rendered anywhere but inside
 * `activityWindow()` (#22).
 *
 * Note `war_stars` here was Clash's lifetime profile counter. The stars this
 * surface shows are `MemberWarActivity.stars`, from wars we observed; they are
 * different numbers and the name collision is why one of them is now spelled
 * out in full wherever both could be meant. */
const ROSTER_COLUMNS = [
  "clan_tag",
  "player_tag",
  "name",
  "role",
  "clan_rank",
  "town_hall_level",
  "league_name",
  "donations",
  "donations_received",
  "war_preference",
  "roster_observed_at",
  "profile_observed_at",
  "first_observed_present_on",
  "is_current_member",
  "current_presence_started_on",
  "departure_observed_on",
].join(",");

type DatabaseRow = Record<string, any>;

export async function loadMemberRoster(client: any, clanTag: string): Promise<MemberRosterMember[]> {
  const result = await client
    .from("member_roster_overview")
    .select(ROSTER_COLUMNS)
    .eq("clan_tag", clanTag);
  if (result.error) throw new Error(result.error.message ?? "Unable to load member history");
  return ((result.data ?? []) as DatabaseRow[])
    .map(mapMember)
    .sort((left, right) => Number(right.isCurrentMember) - Number(left.isCurrentMember)
      || (left.clanRank ?? Number.MAX_SAFE_INTEGER) - (right.clanRank ?? Number.MAX_SAFE_INTEGER)
      || left.name.localeCompare(right.name));
}

/* Keyed by player tag, because every reader of it is asking about one member.
 * The function returns a row for every member the clan has observed, so a
 * missing key means a member the war history has never heard of rather than a
 * member who sat out. */
export async function loadWarActivityWindow(
  client: any,
  clanTag: string,
  windowDays: number,
): Promise<Map<string, MemberWarActivity>> {
  const result = await client.rpc("regular_war_member_activity_window", {
    requested_clan_tag: clanTag,
    requested_window_days: windowDays,
  });
  if (result.error) throw new Error(result.error.message ?? "Unable to load observed war activity");
  const rows = (result.data ?? []) as DatabaseRow[];
  return new Map(rows.map((row) => {
    const activity = mapActivity(row, windowDays);
    return [activity.playerTag, activity];
  }));
}

export function activityStatus(activity: MemberWarActivity | undefined): ActivityStatus {
  if (!activity || activity.warsObserved === 0) return "unknown";
  return activity.attacksMade > 0 ? "observed" : "none";
}

export function roleLabel(role: string | null): string {
  if (!role) return "Unknown";
  return role.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (letter) => letter.toUpperCase());
}

function mapMember(row: DatabaseRow): MemberRosterMember {
  const playerTag = stringValue(row.player_tag) ?? "Unknown member";
  return {
    clanTag: stringValue(row.clan_tag) ?? "Unknown clan",
    playerTag,
    name: stringValue(row.name) ?? playerTag,
    role: stringValue(row.role),
    clanRank: numberValue(row.clan_rank),
    townHallLevel: numberValue(row.town_hall_level),
    leagueName: stringValue(row.league_name),
    donations: numberValue(row.donations),
    donationsReceived: numberValue(row.donations_received),
    warPreference: stringValue(row.war_preference),
    rosterObservedAt: stringValue(row.roster_observed_at) ?? "",
    profileObservedAt: stringValue(row.profile_observed_at),
    firstObservedPresentOn: stringValue(row.first_observed_present_on) ?? "",
    isCurrentMember: row.is_current_member === true,
    currentPresenceStartedOn: stringValue(row.current_presence_started_on),
    departureObservedOn: stringValue(row.departure_observed_on),
  };
}

function mapActivity(row: DatabaseRow, windowDays: number): MemberWarActivity {
  return {
    playerTag: stringValue(row.player_tag) ?? "Unknown member",
    windowDays: numberValue(row.window_days) ?? windowDays,
    warsObserved: numberValue(row.wars_observed) ?? 0,
    warsParticipated: numberValue(row.wars_participated) ?? 0,
    assignedAttacks: numberValue(row.assigned_attacks) ?? 0,
    attacksMade: numberValue(row.attacks_made) ?? 0,
    stars: numberValue(row.stars) ?? 0,
    incompleteWars: numberValue(row.incomplete_wars) ?? 0,
  };
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
