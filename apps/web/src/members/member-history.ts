export interface MemberBaseline {
  observedOn: string;
  role: string | null;
  townHallLevel: number;
  trophies: number | null;
  leagueId: number | null;
  donations: number | null;
  donationsReceived: number | null;
  warPreference: string | null;
  attackWins: number | null;
  defenseWins: number | null;
  clanCapitalContributions: number | null;
  clanGamesPoints: number | null;
}

export interface MemberRosterMember {
  clanTag: string;
  playerTag: string;
  name: string;
  role: string | null;
  clanRank: number | null;
  previousClanRank: number | null;
  townHallLevel: number | null;
  trophies: number | null;
  leagueId: number | null;
  leagueName: string | null;
  donations: number | null;
  donationsReceived: number | null;
  warPreference: string | null;
  warStars: number | null;
  attackWins: number | null;
  defenseWins: number | null;
  clanCapitalContributions: number | null;
  clanGamesPoints: number | null;
  rosterObservedAt: string;
  profileObservedAt: string | null;
  firstObservedPresentOn: string;
  lastObservedPresentOn: string;
  isCurrentMember: boolean;
  currentPresenceStartedOn: string | null;
  departureObservedOn: string | null;
  baseline1d: MemberBaseline | null;
  baseline7d: MemberBaseline | null;
  baseline30d: MemberBaseline | null;
}

export interface ActivityWindow {
  status: "observed" | "no_change" | "unknown";
  baselineOn: string | null;
  evidence: string[];
  resets: string[];
}

type DatabaseRow = Record<string, any>;

export async function loadMemberRoster(client: any, clanTag: string): Promise<MemberRosterMember[]> {
  const result = await client
    .from("member_roster_overview")
    .select("*")
    .eq("clan_tag", clanTag);
  if (result.error) throw new Error(result.error.message ?? "Unable to load member history");
  return ((result.data ?? []) as DatabaseRow[])
    .map(mapMember)
    .sort((left, right) => Number(right.isCurrentMember) - Number(left.isCurrentMember)
      || (left.clanRank ?? Number.MAX_SAFE_INTEGER) - (right.clanRank ?? Number.MAX_SAFE_INTEGER)
      || left.name.localeCompare(right.name));
}

export function activityWindow(member: MemberRosterMember, baseline: MemberBaseline | null): ActivityWindow {
  if (!baseline) return { status: "unknown", baselineOn: null, evidence: [], resets: [] };
  const evidence: string[] = [];
  const resets: string[] = [];
  counterChange(member.attackWins, baseline.attackWins, "multiplayer attacks", evidence, resets);
  counterChange(member.donations, baseline.donations, "troops donated", evidence, resets);
  counterChange(member.donationsReceived, baseline.donationsReceived, "troops received", evidence, resets);
  counterChange(member.clanCapitalContributions, baseline.clanCapitalContributions, "Capital contributions", evidence, resets);
  counterChange(member.clanGamesPoints, baseline.clanGamesPoints, "Clan Games progress", evidence, resets);
  counterChange(member.defenseWins, baseline.defenseWins, "defense wins", evidence, resets);
  if (member.trophies !== null && baseline.trophies !== null && member.trophies !== baseline.trophies) {
    evidence.push(`${signed(member.trophies - baseline.trophies)} trophies`);
  }
  if (member.townHallLevel !== baseline.townHallLevel) evidence.push(`Town Hall ${member.townHallLevel}`);
  if (member.leagueId !== baseline.leagueId) evidence.push(`league changed to ${member.leagueName ?? "unranked"}`);
  if (member.role !== baseline.role) evidence.push(`role changed to ${roleLabel(member.role)}`);
  if (member.warPreference !== baseline.warPreference) evidence.push(`war preference ${member.warPreference ?? "unavailable"}`);
  return {
    status: evidence.length > 0 ? "observed" : "no_change",
    baselineOn: baseline.observedOn,
    evidence,
    resets,
  };
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
    previousClanRank: numberValue(row.previous_clan_rank),
    townHallLevel: numberValue(row.town_hall_level),
    trophies: numberValue(row.trophies),
    leagueId: numberValue(row.league_id),
    leagueName: stringValue(row.league_name),
    donations: numberValue(row.donations),
    donationsReceived: numberValue(row.donations_received),
    warPreference: stringValue(row.war_preference),
    warStars: numberValue(row.war_stars),
    attackWins: numberValue(row.attack_wins),
    defenseWins: numberValue(row.defense_wins),
    clanCapitalContributions: numberValue(row.clan_capital_contributions),
    clanGamesPoints: numberValue(row.clan_games_points),
    rosterObservedAt: stringValue(row.roster_observed_at) ?? "",
    profileObservedAt: stringValue(row.profile_observed_at),
    firstObservedPresentOn: stringValue(row.first_observed_present_on) ?? "",
    lastObservedPresentOn: stringValue(row.last_observed_present_on) ?? "",
    isCurrentMember: row.is_current_member === true,
    currentPresenceStartedOn: stringValue(row.current_presence_started_on),
    departureObservedOn: stringValue(row.departure_observed_on),
    baseline1d: mapBaseline(row.baseline_1d),
    baseline7d: mapBaseline(row.baseline_7d),
    baseline30d: mapBaseline(row.baseline_30d),
  };
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function mapBaseline(value: DatabaseRow | null): MemberBaseline | null {
  if (!value) return null;
  return {
    observedOn: value.observed_on,
    role: value.role,
    townHallLevel: value.town_hall_level,
    trophies: value.trophies,
    leagueId: value.league_id,
    donations: value.donations,
    donationsReceived: value.donations_received,
    warPreference: value.war_preference,
    attackWins: value.attack_wins,
    defenseWins: value.defense_wins,
    clanCapitalContributions: value.clan_capital_contributions,
    clanGamesPoints: value.clan_games_points,
  };
}

function counterChange(
  current: number | null,
  prior: number | null,
  label: string,
  evidence: string[],
  resets: string[],
): void {
  if (current === null || prior === null || current === prior) return;
  if (current < prior) {
    resets.push(`${label} reset`);
    return;
  }
  evidence.push(`+${current - prior} ${label}`);
}

function signed(value: number): string { return value > 0 ? `+${value}` : String(value); }
