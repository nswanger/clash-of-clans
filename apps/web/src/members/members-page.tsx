import { useEffect, useMemo, useState } from "react";
import {
  activityWindow,
  loadMemberRoster,
  roleLabel,
  type MemberRosterMember,
} from "./member-history.js";

interface MemberPageProps { client: any; clanTag: string }
type RosterFilter = "current" | "former" | "all";
type ActivityFilter = "all" | "observed" | "no_change" | "unknown";
type Sort = "rank" | "name" | "town_hall" | "activity" | "observed";

export function RosterOverviewPage(props: MemberPageProps) {
  const state = useMemberRoster(props);
  if (state.status !== "ready") return <MemberState state={state} title="Clan overview" />;
  const current = state.members.filter((member) => member.isCurrentMember);
  const active = current.filter((member) => activityWindow(member, member.baseline7d).status === "observed");
  const unknown = current.filter((member) => activityWindow(member, member.baseline7d).status === "unknown");
  return (
    <main className="members-shell">
      <header className="members-heading">
        <p className="eyebrow">Year-round clan</p>
        <h1>Clan overview</h1>
        <p>Roster health based on successful daily observations. Activity is supporting evidence, not war reliability.</p>
      </header>
      <section className="roster-summary" aria-label="Roster summary">
        <SummaryMetric label="Current members" value={current.length} />
        <SummaryMetric label="7-day activity observed" value={active.length} />
        <SummaryMetric label="Building history" value={unknown.length} />
        <SummaryMetric label="Former members" value={state.members.length - current.length} />
      </section>
      <section className="overview-callout">
        <div><h2>Member history</h2><p>Review roles, observation tenure, profile freshness, and the evidence behind recent activity signals.</p></div>
        <a className="primary-link" href="#/members">Review members</a>
      </section>
    </main>
  );
}

export function MembersPage(props: MemberPageProps) {
  const state = useMemberRoster(props);
  const [search, setSearch] = useState("");
  const [rosterFilter, setRosterFilter] = useState<RosterFilter>("current");
  const [roleFilter, setRoleFilter] = useState("all");
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");
  const [sort, setSort] = useState<Sort>("rank");
  const roles = useMemo(() => state.status === "ready"
    ? [...new Set(state.members.map((member) => member.role).filter((role): role is string => Boolean(role)))].sort()
    : [], [state]);
  const visible = useMemo(() => {
    if (state.status !== "ready") return [];
    const query = search.trim().toLocaleLowerCase();
    return state.members
      .filter((member) => !query || member.name.toLocaleLowerCase().includes(query)
        || member.playerTag.toLocaleLowerCase().includes(query))
      .filter((member) => rosterFilter === "all" || (rosterFilter === "current") === member.isCurrentMember)
      .filter((member) => roleFilter === "all" || member.role === roleFilter)
      .filter((member) => activityFilter === "all"
        || activityWindow(member, member.baseline7d).status === activityFilter)
      .sort(memberSorter(sort));
  }, [activityFilter, roleFilter, rosterFilter, search, sort, state]);

  if (state.status !== "ready") return <MemberState state={state} title="Members" />;
  return (
    <main className="members-shell">
      <header className="members-heading">
        <p className="eyebrow">Year-round clan</p>
        <h1>Members</h1>
        <p>Daily roster facts and explainable activity evidence. “No change observed” does not mean inactive; use availability and war reliability for lineup decisions.</p>
      </header>
      <section className="member-filters" aria-label="Member filters">
        <label>Find a member<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name or player tag" /></label>
        <label>Roster<select value={rosterFilter} onChange={(event) => setRosterFilter(event.target.value as RosterFilter)}><option value="current">Current</option><option value="former">Former</option><option value="all">All observed</option></select></label>
        <label>Role<select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}><option value="all">All roles</option>{roles.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}</select></label>
        <label>7-day evidence<select value={activityFilter} onChange={(event) => setActivityFilter(event.target.value as ActivityFilter)}><option value="all">All</option><option value="observed">Activity observed</option><option value="no_change">No change observed</option><option value="unknown">Building history</option></select></label>
        <label>Sort<select value={sort} onChange={(event) => setSort(event.target.value as Sort)}><option value="rank">Clan rank</option><option value="name">Name</option><option value="town_hall">Town Hall</option><option value="activity">Recent evidence</option><option value="observed">First observed</option></select></label>
      </section>
      <p className="member-result-count">Showing {visible.length} of {state.members.length} observed members</p>
      <div className="member-list">
        {visible.map((member) => <MemberCard key={member.playerTag} member={member} />)}
        {visible.length === 0 ? <p className="empty-members">No members match these filters.</p> : null}
      </div>
    </main>
  );
}

function MemberCard({ member }: { member: MemberRosterMember }) {
  const activity = activityWindow(member, member.baseline7d);
  return (
    <article className={`member-card ${member.isCurrentMember ? "" : "former-member"}`}>
      <div className="member-identity">
        <div><h2>{member.name}</h2><p>{member.playerTag}</p></div>
        <span className={`activity-status ${activity.status}`}>{activityLabel(activity.status)}</span>
      </div>
      <dl className="member-facts">
        <div><dt>Role</dt><dd>{roleLabel(member.role)}</dd></div>
        <div><dt>Town Hall</dt><dd>{member.townHallLevel}</dd></div>
        <div><dt>League</dt><dd>{member.leagueName ?? "Unknown"}</dd></div>
        <div><dt>Donations</dt><dd>{formatNumber(member.donations)} / {formatNumber(member.donationsReceived)} received</dd></div>
        <div><dt>War preference</dt><dd>{member.warPreference ?? "Unavailable"}</dd></div>
        <div><dt>{member.isCurrentMember ? "Current presence observed" : "Departure observed"}</dt><dd>{formatDate(member.isCurrentMember ? member.currentPresenceStartedOn : member.departureObservedOn)}</dd></div>
      </dl>
      <div className="activity-evidence">
        <strong>7-day evidence</strong>
        {activity.status === "observed" ? <ul>{activity.evidence.map((item) => <li key={item}>{item}</li>)}</ul> : <p>{activityLabel(activity.status)}{activity.baselineOn ? ` since ${formatDate(activity.baselineOn)}` : ""}.</p>}
        {activity.resets.length > 0 ? <p className="reset-note">Reset boundary: {activity.resets.join(", ")}.</p> : null}
      </div>
      <p className="member-freshness">Roster observed {formatTimestamp(member.rosterObservedAt)} · Player profile {member.profileObservedAt ? `observed ${formatTimestamp(member.profileObservedAt)}` : "unavailable"}</p>
    </article>
  );
}

function useMemberRoster({ client, clanTag }: MemberPageProps) {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ready"; members: MemberRosterMember[] }
  >({ status: "loading" });
  useEffect(() => {
    let active = true;
    void loadMemberRoster(client, clanTag)
      .then((members) => { if (active) setState({ status: "ready", members }); })
      .catch((error: unknown) => { if (active) setState({ status: "error", message: error instanceof Error ? error.message : "Unable to load member history" }); });
    return () => { active = false; };
  }, [clanTag, client]);
  return state;
}

function MemberState({ state, title }: {
  state: { status: "loading" } | { status: "error"; message: string };
  title: string;
}) {
  return <main className="members-shell"><h1>{title}</h1><p role={state.status === "loading" ? "status" : "alert"}>{state.status === "loading" ? "Loading roster history…" : state.message}</p></main>;
}

function SummaryMetric({ label, value }: { label: string; value: number }) {
  return <div><strong>{value}</strong><span>{label}</span></div>;
}

function memberSorter(sort: Sort) {
  return (left: MemberRosterMember, right: MemberRosterMember): number => {
    if (sort === "name") return left.name.localeCompare(right.name);
    if (sort === "town_hall") return right.townHallLevel - left.townHallLevel || left.name.localeCompare(right.name);
    if (sort === "activity") return activityRank(left) - activityRank(right) || left.name.localeCompare(right.name);
    if (sort === "observed") return left.firstObservedPresentOn.localeCompare(right.firstObservedPresentOn);
    return (left.clanRank ?? Number.MAX_SAFE_INTEGER) - (right.clanRank ?? Number.MAX_SAFE_INTEGER) || left.name.localeCompare(right.name);
  };
}

function activityRank(member: MemberRosterMember): number {
  const status = activityWindow(member, member.baseline7d).status;
  return status === "observed" ? 0 : status === "no_change" ? 1 : 2;
}

function activityLabel(status: "observed" | "no_change" | "unknown"): string {
  if (status === "observed") return "Activity observed";
  if (status === "no_change") return "No change observed";
  return "Building history";
}

function formatNumber(value: number | null): string { return value === null ? "—" : value.toLocaleString(); }
function formatDate(value: string | null): string { return value ? new Date(`${value}T00:00:00Z`).toLocaleDateString() : "Unknown"; }
function formatTimestamp(value: string): string { return new Date(value).toLocaleString(); }
