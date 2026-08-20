import { useEffect, useMemo, useState } from "react";
import { AppTopbar } from "../app-chrome.js";
import { Icon } from "../design/icon.js";
import { Metric, SkeletonRows, SKELETON_DELAY_MS, useWide } from "../design/layout.js";
import { Sheet } from "../design/sheet.js";
import {
  activityStatus,
  loadMemberRoster,
  loadWarActivityWindow,
  roleLabel,
  type ActivityStatus,
  type MemberRosterMember,
  type MemberWarActivity,
} from "./member-history.js";
import "./members-roster.css";

interface MemberPageProps { client: any; clanTag: string }
type RosterFilter = "current" | "former" | "all";
type ActivityFilter = "all" | ActivityStatus;
type Sort = "rank" | "name" | "town_hall" | "activity" | "tenure";
type Panel = { mode: "member"; tag: string } | { mode: "filters" } | null;

/* Three and seven, where the prototype offered one and seven.
 *
 * The short window exists because this is a casual clan and people go quiet
 * suddenly; the question it answers is "who stopped turning up this week", and
 * a long window cannot answer it. Thirty days was considered and rejected for
 * the same reason #22 rejected it: in a casual clan it mostly answers "have
 * they quit", which `is_current_member` and `departure_observed_on` answer
 * directly and better.
 *
 * One day had to go once the source became war history rather than profile
 * counters. A regular war spans about two days, so a one-day window usually
 * contains no war at all and would report "building history" for the entire
 * clan. Three is the shortest window that reliably contains one.
 *
 * Read the short window knowing what it can hold: one logged war, so it is the
 * difference between "turned up for the last war" and "did not". That is a real
 * signal and a thin one, which is why seven is the default. */
const WINDOWS = [{ days: 3, label: "3 days" }, { days: 7, label: "7 days" }] as const;
const DEFAULT_WINDOW_DAYS = 7;

export function MembersPage({ client, clanTag }: MemberPageProps) {
  const [windowDays, setWindowDays] = useState<number>(DEFAULT_WINDOW_DAYS);
  const roster = useMemberRoster(client, clanTag, windowDays);
  const wide = useWide();
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<RosterFilter>("current");
  const [role, setRole] = useState("all");
  const [activity, setActivity] = useState<ActivityFilter>("all");
  const [sort, setSort] = useState<Sort>("rank");
  const [panel, setPanel] = useState<Panel>(null);

  /* Fixed at mount: tenure is measured in days, and a clock that ticks on every
   * render would re-sort the list for nothing. */
  const [now] = useState(() => Date.now());
  const members = roster.members;
  const statusOf = (member: MemberRosterMember) => activityStatus(roster.activity.get(member.playerTag));

  const roles = useMemo(
    () => [...new Set(members.map((member) => member.role).filter((value): value is string => Boolean(value)))].sort(),
    [members],
  );
  const visible = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return members
      .filter((member) => !query || member.name.toLocaleLowerCase().includes(query)
        || member.playerTag.toLocaleLowerCase().includes(query))
      .filter((member) => scope === "all" || (scope === "current") === member.isCurrentMember)
      .filter((member) => role === "all" || member.role === role)
      .filter((member) => activity === "all" || statusOf(member) === activity)
      .sort(memberSorter(sort, statusOf, now));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activity, members, now, role, roster.activity, scope, search, sort]);

  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setPanel(null); };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, []);

  /* Where the panel is docked rather than overlaid, an empty column is dead
   * space that also hides the fact that rows do anything — so the first visible
   * member opens by default. It is only ever a default: any row replaces it,
   * and the narrow layout never auto-opens, because there the panel is a sheet
   * over the whole screen and opening one uninvited would bury the list. */
  const active: Panel = panel ?? (wide && visible[0] ? { mode: "member", tag: visible[0].playerTag } : null);
  const selectedTag = active?.mode === "member" ? active.tag : null;
  const selected = selectedTag ? members.find((member) => member.playerTag === selectedTag) : undefined;
  const windowLabel = WINDOWS.find((option) => option.days === windowDays)?.label ?? `${windowDays} days`;
  const current = members.filter((member) => member.isCurrentMember);
  const filterCount = (scope !== "current" ? 1 : 0) + (role !== "all" ? 1 : 0)
    + (activity !== "all" ? 1 : 0) + (sort !== "rank" ? 1 : 0);

  /* The same string each panel gives its own `aria-label`. The prototype read
   * it back out of the DOM because it had no other handle on what the sheet was
   * showing; here it is state, so it is passed. */
  const sheetLabel = active?.mode === "filters" ? "Filters" : selected?.name ?? "";
  const panelBody = active?.mode === "filters"
    ? <FilterPanel
        counts={`${visible.length} of ${members.length} observed members`}
        roles={roles}
        scope={scope} onScope={setScope}
        role={role} onRole={setRole}
        activity={activity} onActivity={setActivity}
        sort={sort} onSort={setSort}
        onClear={() => { setScope("current"); setRole("all"); setActivity("all"); setSort("rank"); }}
        onClose={() => setPanel(null)}
      />
    : selected
      ? <MemberPanel
          member={selected}
          activity={roster.activity.get(selected.playerTag)}
          windowLabel={windowLabel}
          wide={wide}
          now={now}
          onClose={() => setPanel(null)}
        />
      : null;

  return <>
    <main className="cm-shell members-page">
      <AppTopbar route="members" eyebrow="Year-round clan" title="Members" />

      {/* The summary strip is `cm-summary` now, not `members-summary`. It was
          page layer here because one surface used it; the review phase needed
          exactly the same aggregate read, and a second surface is what promoted
          it (#54). The markup did not change — that is the point of the
          finding. */}
      <div className="cm-summary">
        <Metric value={roster.ready ? current.length : null} label="Current members" />
        <Metric
          value={roster.ready ? current.filter((member) => statusOf(member) === "observed").length : null}
          label={`Activity observed · ${windowLabel}`}
        />
        <Metric
          value={roster.ready ? current.filter((member) => statusOf(member) === "unknown").length : null}
          label="Building history"
        />
        <Metric value={roster.ready ? members.length - current.length : null} label="Former members" />
      </div>

      <div className="members-searchrow">
        <input
          className="cm-search"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Find a member"
          aria-label="Find a member"
        />
        <button className="members-filterbutton" type="button" onClick={() => setPanel({ mode: "filters" })}>
          Filters{filterCount > 0 ? <span className="members-badge">{filterCount}</span> : null}
        </button>
      </div>

      <nav className="cm-segmented members-windowrow" aria-label="Activity window">
        {WINDOWS.map((option) => <button
          key={option.days}
          type="button"
          aria-current={option.days === windowDays}
          onClick={() => setWindowDays(option.days)}
        ><span>{option.label}</span></button>)}
      </nav>

      {roster.error
        ? <div className="cm-notice" role="alert">
            <div className="cm-grow">
              <strong>Roster unavailable</strong>
              <p>{roster.error}</p>
            </div>
          </div>
        : null}

      <div className="cm-columns">
        <div>
          <section className="cm-section members-section" aria-busy={!roster.ready}>
            <div className="cm-section-head">
              <h2>Members <span className="cm-count">{
                roster.ready ? (visible.length === members.length ? `${visible.length}` : `${visible.length} of ${members.length}`) : ""
              }</span></h2>
            </div>
            <div className="members-listhead" aria-hidden="true">
              <span>#</span><span>Member</span>
              <span className="members-group"><span>Attacks</span><span>Stars</span><span>Tenure</span></span>
              <span className="members-th">TH</span><span />
            </div>
            {roster.ready
              ? <div className="cm-rows">
                  {visible.map((member) => <MemberRow
                    key={member.playerTag}
                    member={member}
                    activity={roster.activity.get(member.playerTag)}
                    status={statusOf(member)}
                    selected={member.playerTag === selectedTag}
                    now={now}
                    onOpen={() => setPanel({ mode: "member", tag: member.playerTag })}
                  />)}
                  {visible.length === 0 ? <p className="cm-empty">No members match these filters.</p> : null}
                </div>
              : roster.showSkeleton && !roster.error ? <SkeletonRows /> : null}
          </section>
        </div>
        <div>{wide ? panelBody : null}</div>
      </div>
    </main>
    {!wide && panelBody
      ? <Sheet label={sheetLabel} onClose={() => setPanel(null)}>{panelBody}</Sheet>
      : null}
  </>;
}

/* Rows mark the exception, never the rule. Most members turn up, so a status on
 * every row is the happy-path banner again, one row at a time — the meta line
 * carries the role and then only what is unusual about this member. */
function MemberRow({ member, activity, status, selected, now, onOpen }: {
  member: MemberRosterMember;
  activity: MemberWarActivity | undefined;
  status: ActivityStatus;
  selected: boolean;
  now: number;
  onOpen: () => void;
}) {
  const tenure = tenureDays(member, now);
  const departed = daysSince(member.departureObservedOn, now);
  const mark = !member.isCurrentMember
    ? (departed === null ? "Former member" : `Left ${dayLabel(departed)} ago`)
    : status === "none" ? "No war activity"
    : status === "unknown" ? "Building history"
    : null;
  return (
    <button
      className={`cm-row has-pos ${selected ? "is-selected" : ""} ${member.isCurrentMember ? "" : "is-out"}`}
      type="button"
      onClick={onOpen}
    >
      <span className="cm-row-pos">{member.clanRank ?? "—"}</span>
      <span className="cm-row-main">
        <span className="cm-row-name">{member.name}</span>
        <span className="cm-row-meta">
          {roleLabel(member.role)}
          {mark ? <><span className="cm-sep">·</span><span className="cm-statustext is-unknown">{mark}</span></> : null}
        </span>
      </span>
      <span className="cm-row-stats members-wide-only">
        <span className="cm-row-th members-stat">{activity ? `${activity.attacksMade} / ${activity.assignedAttacks}` : "—"}</span>
        <span className="cm-row-th members-stat">{activity ? activity.stars : "—"}<Icon name="star" /></span>
        <span className="cm-row-th members-stat">{tenure === null ? "—" : dayLabel(tenure)}</span>
      </span>
      <span className="cm-row-stats">
        <span className="cm-row-th">{member.townHallLevel === null ? "TH—" : `TH${member.townHallLevel}`}</span>
      </span>
      <span className="cm-chev" aria-hidden="true"><Icon name="chevron" /></span>
    </button>
  );
}

function MemberPanel({ member, activity, windowLabel, wide, now, onClose }: {
  member: MemberRosterMember;
  activity: MemberWarActivity | undefined;
  windowLabel: string;
  wide: boolean;
  now: number;
  onClose: () => void;
}) {
  const status = activityStatus(activity);
  const tenure = tenureDays(member, now);
  const departed = daysSince(member.departureObservedOn, now);
  return (
    /* A docked column has nothing to dismiss to, so it carries no close control. */
    <div className="cm-panel" {...(wide ? {} : { role: "dialog", "aria-modal": true })} aria-label={member.name}>
      <div className="cm-panel-head">
        <div className="cm-grow">
          <h2>{member.name}</h2>
          <p className="cm-panel-evidence">
            {roleLabel(member.role)} <span className="cm-sep">·</span> {member.townHallLevel === null ? "TH unknown" : `TH${member.townHallLevel}`} <span className="cm-sep">·</span>{" "}
            {member.isCurrentMember
              ? (tenure === null ? "presence not yet dated" : `in the clan ${dayLabel(tenure)}`)
              : (departed === null ? "former member" : `left ${dayLabel(departed)} ago`)}
          </p>
        </div>
        {wide ? null : <button className="cm-iconbutton" type="button" aria-label="Close" onClick={onClose}><Icon name="close" /></button>}
      </div>
      <div className="cm-panel-body">
        {/* One label, not two. The window's war record IS the evidence now, so a
            separate "War record" heading above the same four numbers would be
            naming the same thing twice — and in the observed case it left the
            first label with nothing under it at all. */}
        <p className="cm-panel-label">{activityLabel(status)} · {windowLabel}</p>
        {status === "observed"
          ? null
          : <p className="members-freshness" style={{ marginBottom: "var(--cm-space-4)" }}>{status === "unknown"
              ? "No war we logged ended in this window, so there is no evidence either way. Absent evidence is not inactivity."
              : `No attack of theirs appears in the ${countLabel(activity?.warsObserved ?? 0, "war")} we logged in this window. That is not the same as inactive — try a longer window.`}</p>}
        <dl className="members-facts">
          <div><dt>Wars joined</dt><dd>{activity ? `${activity.warsParticipated} of ${activity.warsObserved} logged` : "—"}</dd></div>
          <div><dt>Attacks used</dt><dd>{activity ? `${activity.attacksMade} of ${activity.assignedAttacks}` : "—"}</dd></div>
          <div><dt>War stars</dt><dd>{activity ? activity.stars : "—"}</dd></div>
          <div><dt>War preference</dt><dd>{member.warPreference ?? "—"}</dd></div>
        </dl>
        {activity && activity.incompleteWars > 0
          ? <ul className="members-evidence">
              <li>{countLabel(activity.incompleteWars, "war")} logged incompletely</li>
            </ul>
          : null}
        <p className="members-freshness">A war counts towards this window by its recorded end time, so a war we
          could not place in time falls in no window at all.</p>

        <p className="cm-panel-label">Roster facts</p>
        <dl className="members-facts">
          <div><dt>Player tag</dt><dd>{member.playerTag}</dd></div>
          <div><dt>League</dt><dd>{member.leagueName ?? "—"}</dd></div>
          <div><dt>Donations</dt><dd>{formatNumber(member.donations)} given · {formatNumber(member.donationsReceived)} received</dd></div>
          <div><dt>In the clan</dt><dd>{member.isCurrentMember
            ? (tenure === null ? "—" : dayLabel(tenure))
            : (departed === null ? "—" : `left ${dayLabel(departed)} ago`)}</dd></div>
        </dl>
        <p className="members-freshness">Roster observed {formatTimestamp(member.rosterObservedAt)} · Player profile
          {member.profileObservedAt ? ` observed ${formatTimestamp(member.profileObservedAt)}` : " never observed"}.</p>
      </div>
    </div>
  );
}

function FilterPanel(props: {
  counts: string;
  roles: string[];
  scope: RosterFilter; onScope: (value: RosterFilter) => void;
  role: string; onRole: (value: string) => void;
  activity: ActivityFilter; onActivity: (value: ActivityFilter) => void;
  sort: Sort; onSort: (value: Sort) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  return (
    <div className="cm-panel" role="dialog" aria-modal="true" aria-label="Filters">
      <div className="cm-panel-head">
        <div className="cm-grow">
          <h2>Filters</h2>
          <p className="cm-panel-evidence">{props.counts}</p>
        </div>
        <button className="cm-iconbutton" type="button" aria-label="Close" onClick={props.onClose}><Icon name="close" /></button>
      </div>
      <div className="cm-panel-body">
        <Choices label="Roster" value={props.scope} onChange={props.onScope} options={[
          ["current", "Current"], ["former", "Former"], ["all", "All observed"],
        ]} />
        <Choices label="Role" value={props.role} onChange={props.onRole} options={[
          ["all", "All"], ...props.roles.map((role) => [role, roleLabel(role)] as [string, string]),
        ]} />
        <Choices label="Evidence" value={props.activity} onChange={props.onActivity} options={[
          ["all", "All"], ["observed", "Observed"], ["none", "No war activity"], ["unknown", "Building history"],
        ]} />
        <Choices label="Sort" value={props.sort} onChange={props.onSort} options={[
          ["rank", "Clan rank"], ["name", "Name"], ["town_hall", "Town Hall"], ["activity", "Evidence"], ["tenure", "Tenure"],
        ]} />
      </div>
      <div className="cm-panel-foot">
        <button className="cm-ghost" type="button" onClick={props.onClear}>Clear all filters</button>
      </div>
    </div>
  );
}

function Choices<Value extends string>({ label, value, options, onChange }: {
  label: string;
  value: Value;
  options: [Value, string][];
  onChange: (value: Value) => void;
}) {
  return (
    <div className="members-fieldset">
      <p className="cm-panel-label" id={`members-filter-${label.toLocaleLowerCase()}`}>{label}</p>
      <div className="members-choices" role="group" aria-labelledby={`members-filter-${label.toLocaleLowerCase()}`}>
        {options.map(([optionValue, optionLabel]) => <button
          key={optionValue}
          type="button"
          aria-pressed={optionValue === value}
          onClick={() => onChange(optionValue)}
        >{optionLabel}</button>)}
      </div>
    </div>
  );
}

/* Roster facts and observed war activity are two loads, and only the second
 * depends on the window — so changing the window re-fetches the activity and
 * leaves the rows where they are. Replacing populated rows with a skeleton to
 * say what the window selector already said destroys the reader's place (#43). */
function useMemberRoster(client: any, clanTag: string, windowDays: number) {
  const [members, setMembers] = useState<MemberRosterMember[]>([]);
  const [activity, setActivity] = useState<Map<string, MemberWarActivity>>(new Map());
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSkeleton, setShowSkeleton] = useState(false);

  useEffect(() => {
    let live = true;
    const skeletonTimer = setTimeout(() => { if (live) setShowSkeleton(true); }, SKELETON_DELAY_MS);
    void Promise.all([
      loadMemberRoster(client, clanTag),
      loadWarActivityWindow(client, clanTag, windowDays),
    ])
      .then(([loadedMembers, loadedActivity]) => {
        if (!live) return;
        setMembers(loadedMembers);
        setActivity(loadedActivity);
        setError(null);
        setReady(true);
      })
      .catch((cause: unknown) => {
        if (!live) return;
        setError(cause instanceof Error ? cause.message : "Unable to load member history");
        setReady(false);
      })
      .finally(() => { clearTimeout(skeletonTimer); });
    return () => { live = false; clearTimeout(skeletonTimer); };
  }, [clanTag, client, windowDays]);

  return { members, activity, ready, error, showSkeleton };
}

function memberSorter(sort: Sort, statusOf: (member: MemberRosterMember) => ActivityStatus, now: number) {
  const rank = (status: ActivityStatus) => status === "observed" ? 0 : status === "none" ? 1 : 2;
  return (left: MemberRosterMember, right: MemberRosterMember): number => {
    if (sort === "name") return left.name.localeCompare(right.name);
    if (sort === "town_hall") return (right.townHallLevel ?? -1) - (left.townHallLevel ?? -1) || left.name.localeCompare(right.name);
    if (sort === "activity") return rank(statusOf(left)) - rank(statusOf(right)) || left.name.localeCompare(right.name);
    if (sort === "tenure") return (tenureDays(right, now) ?? -1) - (tenureDays(left, now) ?? -1) || left.name.localeCompare(right.name);
    return (left.clanRank ?? Number.MAX_SAFE_INTEGER) - (right.clanRank ?? Number.MAX_SAFE_INTEGER) || left.name.localeCompare(right.name);
  };
}

function activityLabel(status: ActivityStatus): string {
  if (status === "observed") return "Activity observed";
  if (status === "none") return "No war activity observed";
  return "Building history";
}

function tenureDays(member: MemberRosterMember, now: number): number | null {
  if (!member.isCurrentMember) return null;
  return daysSince(member.currentPresenceStartedOn ?? member.firstObservedPresentOn, now);
}

function daysSince(observedOn: string | null, now: number): number | null {
  if (!observedOn) return null;
  const observed = Date.parse(`${observedOn}T00:00:00Z`);
  if (Number.isNaN(observed)) return null;
  return Math.max(0, Math.floor((now - observed) / 86_400_000));
}

/* Months all the way to 18, so "12 months" and "1y 0m" never sit in the same
 * column describing near-identical tenures. */
function dayLabel(count: number): string {
  if (count >= 545) return `${Math.floor(count / 365)}y ${Math.round((count % 365) / 30)}m`;
  if (count >= 30) return `${Math.round(count / 30)} months`;
  return `${count} days`;
}

function countLabel(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function formatNumber(value: number | null): string { return value === null ? "—" : value.toLocaleString(); }
function formatTimestamp(value: string): string { return value ? new Date(value).toLocaleString() : "never"; }
