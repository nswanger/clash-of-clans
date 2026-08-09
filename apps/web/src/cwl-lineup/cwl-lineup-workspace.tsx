import { useEffect, useMemo, useState, type DragEvent } from "react";
import { FilterMenu } from "../filter-menu.js";
import {
  loadCurrentCwlLineupWorkspace,
  reinheritCwlLineupPlan,
  saveAvailability,
  saveCwlLineupPlan,
  setCwlLineupPlanLock,
  type CwlAvailability,
  type CwlLineupHistoryEvent,
  type CwlLineupMember,
  type CwlLineupWorkspaceSnapshot,
  type CwlWarState,
} from "../data/operations.js";

const days = [1, 2, 3, 4, 5, 6, 7];
export const CWL_BONUS_STAR_THRESHOLD = 8;
type CwlRosterSort = "availability" | "name" | "townHall" | "role" | "rating" | "regularActivity";
type RegularActivityFilter = "all" | "recent" | "observed" | "no-evidence";
const REGULAR_ACTIVITY_LOOKBACK_DAYS = 90;

const availabilityOptions: Array<{ value: CwlAvailability; label: string; symbol: string }> = [
  { value: "available", label: "Available", symbol: "A" },
  { value: "unknown", label: "Unknown", symbol: "?" },
  { value: "unavailable", label: "Unavailable", symbol: "—" },
];

const availabilityOrder: Record<CwlAvailability, number> = {
  available: 0,
  unknown: 1,
  unavailable: 2,
};

const roleOrder: Record<CwlLineupMember["role"], number> = {
  leader: 0,
  coLeader: 1,
  elder: 2,
  member: 3,
  unknown: 4,
};

type CwlRecommendationChanges = NonNullable<CwlLineupWorkspaceSnapshot["recommendation"]>["changes"];

function availabilityLabel(value: CwlAvailability): string {
  return value === "available" ? "Available" : value === "unavailable" ? "Unavailable" : "Unknown";
}

function roleLabel(value: CwlLineupMember["role"]): string {
  return value === "coLeader" ? "Co-leader" : value === "elder" ? "Elder" : value === "leader" ? "Leader" : value === "member" ? "Member" : "Unknown";
}

function refreshedLabel(value: string | null): string {
  return value ? `Last refreshed ${new Date(value).toLocaleString()}` : "Last refreshed time unavailable";
}

function isStaleError(reason: unknown): boolean {
  return reason instanceof Error && reason.message.toLowerCase().includes("stale");
}

function memberEvidence(member: CwlLineupMember): string {
  const attacks = member.currentWarAssignedAttacks > 0
    ? `${member.attackEvidenceWarDay ? `Day ${member.attackEvidenceWarDay}: ` : ""}${member.currentWarAttacksMade} / ${member.currentWarAssignedAttacks} attacks observed`
    : "No attacks observed";
  const rating = member.overallRating === null ? "No CWL rating yet" : `${Math.round(member.overallRating)} CWL rating`;
  const regular = member.regularWarsParticipated > 0
    ? `${member.regularWarsParticipated} regular wars observed · ${member.regularActivityScore ?? 0}% attacks used · ${member.regularStarsPerAttack === null ? "—" : `${member.regularStarsPerAttack.toFixed(1)}★ / attack`}`
    : "No regular-war evidence";
  const captureQuality = member.regularWarsIncomplete > 0
    ? ` · ${member.regularWarsIncomplete} incomplete capture${member.regularWarsIncomplete === 1 ? "" : "s"}`
    : "";
  return `${roleLabel(member.role)} · TH${member.townHallLevel} · ${attacks} · ${member.stars}★ · ${rating} · ${regular}${captureQuality}`;
}

export function isBonusSecured(member: CwlLineupMember): boolean {
  return member.stars >= CWL_BONUS_STAR_THRESHOLD;
}

function starsPerWar(member: CwlLineupMember): number | null {
  return member.cwlWarsParticipated > 0 ? member.stars / member.cwlWarsParticipated : null;
}

export function sortBonusPriority(left: CwlLineupMember, right: CwlLineupMember): number {
  const securedDifference = Number(isBonusSecured(right)) - Number(isBonusSecured(left));
  if (securedDifference !== 0) return securedDifference;
  const starsDifference = right.stars - left.stars;
  if (starsDifference !== 0) return starsDifference;
  const efficiencyDifference = (starsPerWar(right) ?? -1) - (starsPerWar(left) ?? -1);
  if (efficiencyDifference !== 0) return efficiencyDifference;
  return right.cwlWarsParticipated - left.cwlWarsParticipated || left.name.localeCompare(right.name);
}

export function needsBonusTurn(member: CwlLineupMember): boolean {
  return member.availability === "available"
    && member.stars < CWL_BONUS_STAR_THRESHOLD
    && member.assignedAttacks === 0
    && !member.observed;
}

export function isAvailableRotationCandidate(member: CwlLineupMember): boolean {
  return member.availability === "available"
    && member.stars < CWL_BONUS_STAR_THRESHOLD
    && !member.observed;
}

export function hasRegularWarEvidence(member: CwlLineupMember): boolean {
  return member.regularWarsParticipated > 0;
}

export function hasRecentRegularWarEvidence(member: CwlLineupMember, now = new Date()): boolean {
  if (!member.regularLastObservedAt) return false;
  const observedAt = new Date(member.regularLastObservedAt).getTime();
  return Number.isFinite(observedAt)
    && observedAt >= now.getTime() - REGULAR_ACTIVITY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
}

export function sortRegularActivity(left: CwlLineupMember, right: CwlLineupMember): number {
  return (right.regularActivityScore ?? -1) - (left.regularActivityScore ?? -1)
    || (right.regularPerformanceScore ?? -1) - (left.regularPerformanceScore ?? -1)
    || (right.regularWarsParticipated - left.regularWarsParticipated)
    || left.name.localeCompare(right.name);
}

export function filterAvailableRotationChanges(
  changes: CwlRecommendationChanges,
  members: CwlLineupMember[],
): CwlRecommendationChanges {
  const memberByTag = new Map(members.map((member) => [member.playerTag, member]));
  return changes.filter((change) => {
    const incoming = memberByTag.get(change.inPlayerTag);
    return incoming ? isAvailableRotationCandidate(incoming) : false;
  });
}

function sortCwlMembers(left: CwlLineupMember, right: CwlLineupMember, sort: CwlRosterSort): number {
  if (sort === "name") return left.name.localeCompare(right.name);
  if (sort === "townHall") return right.townHallLevel - left.townHallLevel || left.name.localeCompare(right.name);
  if (sort === "role") return roleOrder[left.role] - roleOrder[right.role] || left.name.localeCompare(right.name);
  if (sort === "rating") return (right.overallRating ?? -1) - (left.overallRating ?? -1) || left.name.localeCompare(right.name);
  if (sort === "regularActivity") return sortRegularActivity(left, right);
  return availabilityOrder[left.availability] - availabilityOrder[right.availability] || left.name.localeCompare(right.name);
}

function applyRecommendation(plan: string[], changes: Array<{ outPlayerTag: string; inPlayerTag: string }>): string[] {
  const next = [...plan];
  for (const change of changes) {
    const outIndex = next.indexOf(change.outPlayerTag);
    if (outIndex >= 0 && !next.includes(change.inPlayerTag)) next[outIndex] = change.inPlayerTag;
  }
  return next;
}

export function isRotationChangeApplied(plan: string[], change: { outPlayerTag: string; inPlayerTag: string }): boolean {
  return plan.includes(change.inPlayerTag) && !plan.includes(change.outPlayerTag);
}

function lineupAdjustmentSummary(event: CwlLineupHistoryEvent): string | null {
  if (event.eventType !== "lineup_plan_saved") return null;
  const previous = Array.isArray(event.eventData.previousPlayerTags)
    ? event.eventData.previousPlayerTags.filter((tag): tag is string => typeof tag === "string")
    : [];
  const current = Array.isArray(event.eventData.playerTags)
    ? event.eventData.playerTags.filter((tag): tag is string => typeof tag === "string")
    : [];
  if (!Object.hasOwn(event.eventData, "previousPlayerTags") || !Object.hasOwn(event.eventData, "playerTags")) return null;
  const added = current.filter((tag) => !previous.includes(tag));
  const removed = previous.filter((tag) => !current.includes(tag));
  const sameMembers = added.length === 0 && removed.length === 0;
  const orderChanged = sameMembers && previous.some((tag, index) => current[index] !== tag);
  const details = [
    added.length ? `Added ${added.join(", ")}` : "",
    removed.length ? `Removed ${removed.join(", ")}` : "",
    orderChanged ? "Order changed" : "",
  ].filter(Boolean);
  return details.length ? details.join(" · ") : "No lineup membership or order change";
}

function displayMemberName(playerTag: string, members: CwlLineupMember[]): string {
  return members.find((member) => member.playerTag === playerTag)?.name ?? "Unknown member";
}

function lineupAdjustmentSummaryWithNames(event: CwlLineupHistoryEvent, members: CwlLineupMember[]): string | null {
  const summary = lineupAdjustmentSummary(event);
  if (!summary || event.eventType !== "lineup_plan_saved") return summary;
  const previous = Array.isArray(event.eventData.previousPlayerTags)
    ? event.eventData.previousPlayerTags.filter((tag): tag is string => typeof tag === "string")
    : [];
  const current = Array.isArray(event.eventData.playerTags)
    ? event.eventData.playerTags.filter((tag): tag is string => typeof tag === "string")
    : [];
  const added = current.filter((tag) => !previous.includes(tag));
  const removed = previous.filter((tag) => !current.includes(tag));
  const sameMembers = added.length === 0 && removed.length === 0;
  const orderChanged = sameMembers && previous.some((tag, index) => current[index] !== tag);
  const details = [
    added.length ? `Added ${added.map((tag) => displayMemberName(tag, members)).join(", ")}` : "",
    removed.length ? `Removed ${removed.map((tag) => displayMemberName(tag, members)).join(", ")}` : "",
    orderChanged ? "Order changed" : "",
  ].filter(Boolean);
  return details.length ? details.join(" · ") : "No lineup membership or order change";
}

function AvailabilityControl({ member, onChange }: { member: CwlLineupMember; onChange: (status: CwlAvailability) => void }) {
  const [open, setOpen] = useState(false);
  const currentOption = availabilityOptions.find((option) => option.value === member.availability) ?? { value: "unknown" as const, label: "Unknown", symbol: "?" };
  return <span className="cwl-proto-availability-menu">
    <button
      className={`cwl-proto-availability-control availability-${member.availability}`}
      type="button"
      title={`${availabilityLabel(member.availability)}. Click to choose availability.`}
      aria-label={`Change ${member.name} availability from ${availabilityLabel(member.availability)}`}
      aria-haspopup="menu"
      aria-expanded={open}
      onClick={() => setOpen((value) => !value)}
    >
      {currentOption.symbol}
    </button>
    {open ? <div className="cwl-proto-availability-popover" role="menu" aria-label={`${member.name} availability`}>
      <span className="cwl-proto-availability-menu-label">Set availability</span>
      {availabilityOptions.map((option) => <button
        key={option.value}
        className={`cwl-proto-availability-option availability-${option.value} ${option.value === member.availability ? "selected" : ""}`}
        type="button"
        role="menuitemradio"
        aria-label={option.label}
        aria-checked={option.value === member.availability}
        onClick={() => {
          setOpen(false);
          if (option.value !== member.availability) onChange(option.value);
        }}
      >
        <span className="cwl-proto-availability-option-symbol">{option.symbol}</span>
        <span>{option.label}</span>
        {option.value === member.availability ? <small>Current</small> : null}
      </button>)}
    </div> : null}
  </span>;
}

function MemberBadge({ member }: { member: CwlLineupMember }) {
  return <span className="cwl-proto-member-badge">
    <strong>{member.name}</strong>
    <small>{memberEvidence(member)}</small>
  </span>;
}

function warDayStatus(state: CwlWarState | undefined): string {
  return state === "warEnded" ? "Complete" : state === "inWar" ? "In war" : state === "preparation" ? "Planning" : "Upcoming";
}

function DayStrip({ day, warDays, onChange }: { day: number; warDays: CwlLineupWorkspaceSnapshot["warDays"]; onChange: (day: number) => void }) {
  const states = new Map(warDays.map((war) => [war.warDay, war.state]));
  return <div className="cwl-proto-day-strip" aria-label="CWL war days">
    {days.map((item) => <button key={item} className={item === day ? "selected" : ""} type="button" onClick={() => onChange(item)}>
      <span>Day {item}</span><small>{warDayStatus(states.get(item))}</small>
    </button>)}
  </div>;
}

function StatusBar({ snapshot, dirty, stale, message, onReload, onSave }: {
  snapshot: CwlLineupWorkspaceSnapshot;
  dirty: boolean;
  stale: boolean;
  message: string;
  onReload: () => void;
  onSave: () => void;
}) {
  return <section className={`cwl-proto-status ${stale ? "is-stale" : ""}`} aria-live="polite">
    <div>
      <strong>{stale ? "This plan is out of date" : snapshot.plan.isLocked ? "Day is locked for editing" : dirty ? "Unsaved lineup changes" : "Latest saved lineup"}</strong>
      <p>{stale ? "Another leader saved or locked this day. Reload latest before saving." : message}</p>
    </div>
    {stale ? <button type="button" onClick={onReload}>Reload latest</button> : <div className="cwl-proto-status-actions">
      <button type="button" disabled={snapshot.plan.isLocked || !dirty} onClick={onSave}>Save plan</button>
      <span className="cwl-proto-count">Revision {snapshot.plan.revision}</span>
    </div>}
  </section>;
}

function LineupSlot({ member, index, observed, locked, onDrop, onDragStart, onRemove, onAvailabilityChange }: {
  member: CwlLineupMember;
  index: number;
  observed: boolean;
  locked: boolean;
  onDrop: (event: DragEvent<HTMLDivElement>, index: number) => void;
  onDragStart: (event: DragEvent<HTMLDivElement>, playerTag: string) => void;
  onRemove: () => void;
  onAvailabilityChange: (status: CwlAvailability) => void;
}) {
  return <div
    className={`cwl-proto-slot ${observed ? "observed" : ""}`}
    draggable={!locked}
    onDragStart={(event) => onDragStart(event, member.playerTag)}
    onDragOver={(event) => event.preventDefault()}
    onDrop={(event) => onDrop(event, index)}
  >
    <span className="cwl-proto-slot-number">{index + 1}</span>
    <MemberBadge member={member} />
    <span className="cwl-proto-slot-meta">
      {isBonusSecured(member) ? <span className="cwl-proto-rotation-badge is-secured">8★ secured</span> : null}
      <span className="cwl-proto-slot-state">{observed ? "Observed" : "Planned"}</span>
    </span>
    <AvailabilityControl member={member} onChange={onAvailabilityChange} />
    {!locked ? <button type="button" aria-label={`Bench ${member.name}`} onClick={onRemove}>×</button> : null}
  </div>;
}

function PoolMember({ member, locked, onDragStart, onAdd, onAvailabilityChange }: {
  member: CwlLineupMember;
  locked: boolean;
  onDragStart: (event: DragEvent<HTMLDivElement>, playerTag: string) => void;
  onAdd: () => void;
  onAvailabilityChange: (status: CwlAvailability) => void;
}) {
  return <div
    className={`cwl-proto-pool-member availability-${member.availability}`}
    draggable={!locked}
    onDragStart={(event) => onDragStart(event, member.playerTag)}
  >
    <span className="cwl-proto-pool-avatar">{member.name.slice(0, 1)}</span>
    <span><strong>{member.name}</strong><small>{memberEvidence(member)}</small></span>
    <span className="cwl-proto-pool-status">
      {needsBonusTurn(member) ? <span className="cwl-proto-rotation-badge needs-turn">Needs a turn</span> : null}
      <AvailabilityControl member={member} onChange={onAvailabilityChange} />
    </span>
    <button className="cwl-proto-pool-action" type="button" disabled={locked} onClick={onAdd}>Add</button>
  </div>;
}

function recommendationEvidence(member: CwlLineupMember, direction: "out" | "in"): string {
  if (direction === "out" && isBonusSecured(member)) return `${member.stars}★ · Bonus secured`;
  if (direction === "in") {
    const assignments = member.assignedAttacks === 0 ? "No prior assignment" : `${member.assignedAttacks} prior assignment${member.assignedAttacks === 1 ? "" : "s"}`;
    const rating = member.overallRating === null ? "No CWL rating" : `${Math.round(member.overallRating)} CWL rating`;
    const activity = member.regularActivityScore === null ? "No regular-war evidence" : `${member.regularActivityScore}% regular activity`;
    return `${availabilityLabel(member.availability)} · ${member.stars}★ · ${assignments} · ${rating} · ${activity}`;
  }
  return `${member.stars}★ · Review rotation fit`;
}

function RecommendationPanel({ snapshot, draft, locked, changes, previewActive, onPreview, onRevert, onApplyChange }: { snapshot: CwlLineupWorkspaceSnapshot; draft: string[]; locked: boolean; changes: CwlRecommendationChanges; previewActive: boolean; onPreview: (changes: CwlRecommendationChanges) => void; onRevert: () => void; onApplyChange: (change: CwlRecommendationChanges[number]) => void }) {
  const memberByTag = new Map(snapshot.members.map((member) => [member.playerTag, member]));
  return <section className="cwl-proto-panel cwl-proto-recommendation" aria-label="Rotation queue">
    <div className="cwl-proto-panel-heading"><div><p className="eyebrow">Rotation queue</p><h2>{changes.length ? "Review rotation opportunities" : "No valid rotation proposal"}</h2></div>{changes.length ? <span className="cwl-proto-confidence">Available only</span> : null}</div>
    <p className="cwl-proto-panel-lede">Incoming subs are limited to members marked Available. Recommendations also weigh attack evidence, rotation goals, Town Hall fit, and current role data. They never change the plan or game automatically.</p>
    {changes.slice(0, 3).map((change) => {
      const outgoing = memberByTag.get(change.outPlayerTag);
      const incoming = memberByTag.get(change.inPlayerTag);
      const applied = isRotationChangeApplied(draft, change);
      return <div className="cwl-proto-recommendation-row" key={`${change.outPlayerTag}:${change.inPlayerTag}`}>
      <span className="cwl-proto-member-badge"><strong>{change.outPlayerName ?? outgoing?.name ?? "Outgoing member"}</strong><small>{outgoing ? recommendationEvidence(outgoing, "out") : "Review"}</small></span>
      <span className="cwl-proto-arrow">→</span>
      <span className="cwl-proto-member-badge"><strong>{change.inPlayerName ?? incoming?.name ?? "Incoming member"}</strong><small>{incoming ? recommendationEvidence(incoming, "in") : change.explanation || "Available candidate"}</small></span>
      <button className="cwl-proto-row-action" type="button" disabled={locked || applied} aria-label={`${applied ? "Applied" : "Apply rotation"} from ${change.outPlayerName ?? outgoing?.name ?? "outgoing member"} to ${change.inPlayerName ?? incoming?.name ?? "incoming member"}`} onClick={() => onApplyChange(change)}>{applied ? "Applied" : "Apply"}</button>
    </div>;
    })}
    {changes.length ? <>
      <button className="cwl-proto-primary-button" type="button" disabled={locked || previewActive} onClick={() => onPreview(changes)}>{previewActive ? "Rotation preview applied" : "Preview rotation"}</button>
      {previewActive ? <button className="cwl-proto-revert-button" type="button" onClick={onRevert}>Revert preview</button> : null}
    </> : null}
  </section>;
}

function BonusPriorityPanel({ members }: { members: CwlLineupMember[] }) {
  const candidates = members
    .slice()
    .sort(sortBonusPriority)
    .slice(0, 8);
  return <section className="cwl-proto-panel cwl-proto-context-panel" aria-label="CWL bonus priority">
    <div className="cwl-proto-panel-heading"><div><p className="eyebrow">Reward fairness</p><h2>Bonus priority</h2></div><span className="cwl-proto-count">8★ target</span></div>
    <p className="cwl-proto-panel-lede">Qualified and below-target members are both included. Qualified members are ranked first by total CWL stars, with wars participated and stars per war as supporting context. This is a reference for bonus decisions, not an automatic award.</p>
    <ol className="cwl-proto-bonus-list">{candidates.map((member, index) => {
      const qualified = isBonusSecured(member);
      const efficiency = starsPerWar(member);
      return <li className={qualified ? "is-qualified" : undefined} key={member.playerTag}>
        <span className="cwl-proto-bonus-rank">{index + 1}</span>
        <span><strong>{member.name}</strong><small>{member.stars}★ · {member.cwlWarsParticipated} war{member.cwlWarsParticipated === 1 ? "" : "s"}{efficiency === null ? " · No war evidence" : ` · ${efficiency.toFixed(1)}★ / war`}</small></span>
        <strong className="cwl-proto-bonus-status">{qualified ? "Qualified" : "Below 8★"}</strong>
      </li>;
    })}</ol>
    {candidates.length === 0 ? <p className="cwl-proto-pool-empty">No CWL members are available for bonus review yet.</p> : null}
  </section>;
}

function RotationAttention({ securedCount, candidateCount, changes, locked, previewActive, onPreview, onRevert }: { securedCount: number; candidateCount: number; changes: CwlRecommendationChanges; locked: boolean; previewActive: boolean; onPreview: (changes: CwlRecommendationChanges) => void; onRevert: () => void }) {
  if (changes.length === 0) return null;
  const summary = [
    securedCount ? `${securedCount} planned member${securedCount === 1 ? " has" : "s have"} 8★+` : "Rotation candidates are ready",
    candidateCount ? `${candidateCount} available member${candidateCount === 1 ? " needs" : "s need"} bonus stars` : "",
  ].filter(Boolean).join(" · ");
  return <section className="cwl-proto-rotation-attention" aria-label="Rotation opportunity">
    <div><strong>{previewActive ? "Rotation preview applied" : "Rotation opportunity"}</strong><p>{previewActive ? "These changes are local only. Nothing has been saved yet." : summary}</p></div>
    {previewActive ? <button type="button" onClick={onRevert}>Revert preview</button> : <button type="button" disabled={locked} onClick={() => onPreview(changes)}>Preview rotation</button>}
  </section>;
}

function HistoryPanel({ snapshot }: { snapshot: CwlLineupWorkspaceSnapshot }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? snapshot.history : snapshot.history.slice(0, 5);
  return <section className="cwl-proto-panel cwl-proto-context-panel">
    <div className="cwl-proto-panel-heading"><div><p className="eyebrow">Operational record</p><h2>Lineup History</h2></div><span className="cwl-proto-count">{showAll ? "All updates" : "Last 5 updates"}</span></div>
    <p className="cwl-proto-panel-lede">Saves, inheritance, lock changes, and observed API refreshes are summarized here. Member drag movements are not archived.</p>
    <ul className="cwl-proto-audit-list">{visible.map((event) => <li key={event.id}>
      <span className={`audit-dot ${event.eventType.includes("locked") || event.eventType.includes("unlocked") ? "lock" : event.eventType.includes("observed") ? "observe" : "save"}`} />
      <div><strong>{event.label}</strong><small>{event.actorName} · {new Date(event.occurredAt).toLocaleString()}</small>{lineupAdjustmentSummaryWithNames(event, snapshot.members) ? <small>{lineupAdjustmentSummaryWithNames(event, snapshot.members)}</small> : null}</div>
    </li>)}</ul>
    <button className="cwl-proto-history-button" type="button" aria-expanded={showAll} onClick={() => setShowAll((value) => !value)}>{showAll ? "Show summary" : "View all lineup updates"}</button>
  </section>;
}

export function CwlLineupWorkspacePage({ client, clanTag }: { client: any; clanTag: string }) {
  const [day, setDay] = useState<number>();
  const [snapshot, setSnapshot] = useState<CwlLineupWorkspaceSnapshot>();
  const [draft, setDraft] = useState<string[]>([]);
  const [rotationPreviewBaseline, setRotationPreviewBaseline] = useState<string[] | null>(null);
  const [stale, setStale] = useState(false);
  const [message, setMessage] = useState("Loading the daily plan…");
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [rosterSort, setRosterSort] = useState<CwlRosterSort>("availability");
  const [memberSearch, setMemberSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [townHallFilter, setTownHallFilter] = useState("all");
  const [regularActivityFilter, setRegularActivityFilter] = useState<RegularActivityFilter>("all");

  const load = async () => {
    setLoading(true);
    setError(undefined);
    setRotationPreviewBaseline(null);
    try {
      const next = await loadCurrentCwlLineupWorkspace(client, clanTag, day);
      if (day === undefined) setDay(next.plan.warDay);
      setSnapshot(next);
      setDraft(next.plan.playerTags);
      setStale(false);
      setMessage(`Day ${next.plan.warDay} is ready. Availability changes apply to the season and do not change this plan automatically.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load the CWL lineup workspace.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [client, clanTag, day]);

  const memberByTag = useMemo(() => new Map(snapshot?.members.map((member) => [member.playerTag, member]) ?? []), [snapshot]);
  const planned = useMemo(() => draft.flatMap((tag) => {
    const member = memberByTag.get(tag);
    return member ? [member] : [];
  }), [draft, memberByTag]);
  const pool = useMemo(() => (snapshot?.members ?? []).filter((member) => !draft.includes(member.playerTag)), [draft, snapshot]);
  const roles = useMemo(() => [...new Set(pool.map((member) => member.role))].sort((left, right) => roleOrder[left] - roleOrder[right]), [pool]);
  const townHalls = useMemo(() => [...new Set(pool.map((member) => member.townHallLevel))].sort((left, right) => right - left), [pool]);
  const filteredPool = useMemo(() => {
    const query = memberSearch.trim().toLocaleLowerCase();
    return pool
      .filter((member) => !query || member.name.toLocaleLowerCase().includes(query))
      .filter((member) => roleFilter === "all" || member.role === roleFilter)
      .filter((member) => townHallFilter === "all" || member.townHallLevel === Number(townHallFilter))
      .filter((member) => regularActivityFilter === "all"
        || (regularActivityFilter === "recent" && hasRecentRegularWarEvidence(member))
        || (regularActivityFilter === "observed" && hasRegularWarEvidence(member))
        || (regularActivityFilter === "no-evidence" && !hasRegularWarEvidence(member)))
      .sort((left, right) => sortCwlMembers(left, right, rosterSort));
  }, [memberSearch, pool, regularActivityFilter, roleFilter, rosterSort, townHallFilter]);
  const rotationChanges = useMemo(
    () => filterAvailableRotationChanges(snapshot?.recommendation?.changes ?? [], snapshot?.members ?? []),
    [snapshot],
  );
  const securedPlannedCount = useMemo(() => planned.filter(isBonusSecured).length, [planned]);
  const rotationCandidateCount = useMemo(() => pool.filter(isAvailableRotationCandidate).length, [pool]);
  const dirty = Boolean(snapshot && JSON.stringify(draft) !== JSON.stringify(snapshot.plan.playerTags));

  if (loading && !snapshot) return <main className="dashboard-shell"><p role="status">Loading CWL lineup workspace…</p></main>;
  if (error && !snapshot) return <main className="dashboard-shell"><div role="alert">{error}</div></main>;
  if (!snapshot || day === undefined) return null;

  const updateAvailability = async (member: CwlLineupMember, nextAvailability: CwlAvailability) => {
    try {
      await saveAvailability(client, { clanTag, seasonId: snapshot.season.seasonId, playerTag: member.playerTag, status: nextAvailability, note: "" });
      setSnapshot((current) => current ? { ...current, members: current.members.map((item) => item.playerTag === member.playerTag ? { ...item, availability: nextAvailability } : item) } : current);
      setRotationPreviewBaseline(null);
      setMessage(`${member.name} marked ${availabilityLabel(nextAvailability)}. The lineup was not changed.`);
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Unable to save availability."); }
  };

  const clearRotationPreview = () => setRotationPreviewBaseline(null);
  const addMember = (playerTag: string) => { if (!snapshot.plan.isLocked && !draft.includes(playerTag)) { clearRotationPreview(); setDraft((current) => [...current, playerTag]); } };
  const removeMember = (playerTag: string) => { if (!snapshot.plan.isLocked) { clearRotationPreview(); setDraft((current) => current.filter((tag) => tag !== playerTag)); } };
  const dragStart = (event: DragEvent<HTMLDivElement>, playerTag: string) => { event.dataTransfer.setData("text/plain", playerTag); };
  const drop = (event: DragEvent<HTMLDivElement>, index: number) => {
    event.preventDefault();
    if (snapshot.plan.isLocked) return;
    const playerTag = event.dataTransfer.getData("text/plain");
    if (!playerTag || !memberByTag.has(playerTag)) return;
    clearRotationPreview();
    setDraft((current) => {
      const next = current.filter((tag) => tag !== playerTag);
      next.splice(Math.min(index, next.length), 0, playerTag);
      return next;
    });
  };

  const save = async () => {
    try {
      const plan = await saveCwlLineupPlan(client, { clanTag, seasonId: snapshot.season.seasonId, warDay: day, expectedRevision: snapshot.plan.revision, playerTags: draft });
      setSnapshot((current) => current ? { ...current, plan } : current);
      setDraft(plan.playerTags);
      setRotationPreviewBaseline(null);
      setStale(false);
      setMessage(`Day ${day} plan saved at revision ${plan.revision}.`);
    } catch (reason) {
      setStale(isStaleError(reason));
      setMessage(reason instanceof Error ? reason.message : "Unable to save the lineup plan.");
    }
  };

  const toggleLock = async () => {
    try {
      const plan = await setCwlLineupPlanLock(client, { clanTag, seasonId: snapshot.season.seasonId, warDay: day, expectedRevision: snapshot.plan.revision, isLocked: !snapshot.plan.isLocked });
      setSnapshot((current) => current ? { ...current, plan } : current);
      setStale(false);
      setMessage(plan.isLocked ? `Day ${day} is locked. Availability remains editable.` : `Day ${day} is unlocked for lineup edits.`);
    } catch (reason) {
      setStale(isStaleError(reason));
      setMessage(reason instanceof Error ? reason.message : "Unable to change the lineup lock.");
    }
  };

  const reinherit = async () => {
    if (day <= 1 || snapshot.plan.isLocked) return;
    try {
      const plan = await reinheritCwlLineupPlan(client, { clanTag, seasonId: snapshot.season.seasonId, warDay: day, expectedRevision: snapshot.plan.revision });
      setSnapshot((current) => current ? { ...current, plan } : current);
      setDraft(plan.playerTags);
      setRotationPreviewBaseline(null);
      setStale(false);
      setMessage(`Day ${day} copied Day ${day - 1}. Review the independent snapshot before saving further edits.`);
    } catch (reason) {
      setStale(isStaleError(reason));
      setMessage(reason instanceof Error ? reason.message : "Unable to re-inherit the lineup plan.");
    }
  };

  const previewRotation = (changes: CwlRecommendationChanges) => {
    if (changes.length === 0 || snapshot.plan.isLocked) return;
    const next = applyRecommendation(draft, changes);
    if (JSON.stringify(next) === JSON.stringify(draft)) {
      setMessage("Those rotation changes are already reflected in the draft.");
      return;
    }
    setRotationPreviewBaseline((current) => current ?? [...draft]);
    setDraft(next);
    setMessage("Rotation preview applied locally. Save the plan only after leader review.");
  };

  const applyRotationChange = (change: CwlRecommendationChanges[number]) => previewRotation([change]);

  const revertRotationPreview = () => {
    if (!rotationPreviewBaseline) return;
    setDraft(rotationPreviewBaseline);
    setRotationPreviewBaseline(null);
    setMessage("Rotation preview reverted. No lineup changes were saved.");
  };

  return <main className="cwl-proto-shell cwl-proto-variant-a">
    <header className="cwl-proto-header">
      <div><p className="eyebrow">CWL season · {snapshot.season.seasonId}</p><h1>Lineup workspace</h1><p className="cwl-proto-freshness">{refreshedLabel(snapshot.freshness.lastRefreshedAt)}{snapshot.freshness.collectionStatus ? ` · Collection ${snapshot.freshness.collectionStatus}` : ""}</p></div>
      <div className="cwl-proto-header-actions"><span className={`cwl-proto-lock ${snapshot.plan.isLocked ? "is-locked" : ""}`}>{snapshot.plan.isLocked ? "🔒 Locked" : "Unlocked"}<small>Day {day} · rev {snapshot.plan.revision}</small></span><button className="cwl-proto-secondary-button" type="button" onClick={() => void toggleLock()}>{snapshot.plan.isLocked ? "Unlock day" : "Lock day"}</button></div>
    </header>
    <DayStrip day={day} warDays={snapshot.warDays} onChange={setDay} />
    <div className="cwl-proto-inline-notice"><span><strong>Planned lineup</strong> is the editable leader plan. <strong>Observed lineup</strong> comes from the Clash API after the war starts. Each new day inherits once, then stays independent.</span><button type="button" disabled={snapshot.plan.isLocked || day === 1} onClick={() => void reinherit()}>Re-inherit prior day</button></div>
    <StatusBar snapshot={snapshot} dirty={dirty} stale={stale} message={message} onReload={() => void load()} onSave={() => void save()} />
    <RotationAttention securedCount={securedPlannedCount} candidateCount={rotationCandidateCount} changes={rotationChanges} locked={snapshot.plan.isLocked} previewActive={rotationPreviewBaseline !== null} onPreview={previewRotation} onRevert={revertRotationPreview} />
    {error ? <div className="cwl-proto-status is-stale" role="alert"><strong>{error}</strong></div> : null}
    <div className="cwl-proto-command-grid">
      <div className="cwl-proto-plan-board">
        <section className="cwl-proto-panel cwl-proto-plan-panel"><div className="cwl-proto-panel-heading"><div><p className="eyebrow">Day {day} plan</p><h2>{draft.length} planned · drag to reorder</h2></div><span className="cwl-proto-count">{draft.length} / {snapshot.season.warSize}</span></div><div className="cwl-proto-slot-grid">{planned.map((member, index) => <LineupSlot key={member.playerTag} member={member} index={index} observed={member.observed} locked={snapshot.plan.isLocked} onDrop={drop} onDragStart={dragStart} onRemove={() => removeMember(member.playerTag)} onAvailabilityChange={(status) => void updateAvailability(member, status)} />)}</div></section>
        <section className="cwl-proto-panel cwl-proto-pool-panel" aria-label="Substitute pool"><div className="cwl-proto-panel-heading"><div><p className="eyebrow">Season roster</p><h2>Substitute pool</h2></div><span className="cwl-proto-count">{filteredPool.length}{filteredPool.length !== pool.length ? ` / ${pool.length}` : ""}</span></div><p className="cwl-proto-help">Availability is season-scoped and remains editable while this daily plan is locked. Regular-war scores use observed evidence; missing signup opportunity is not treated as poor activity.</p><div className="cwl-proto-roster-filters" aria-label="Filter substitute pool"><label>Find member<input aria-label="Filter lineup members by name" value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} placeholder="Name" /></label><FilterMenu label="Role" ariaLabel="Filter lineup members by role" value={roleFilter} onChange={setRoleFilter} options={[{ value: "all", label: "All roles" }, ...roles.map((role) => ({ value: role, label: roleLabel(role) }))]} /><FilterMenu label="Town Hall" ariaLabel="Filter lineup members by Town Hall" value={townHallFilter} onChange={setTownHallFilter} options={[{ value: "all", label: "All Town Halls" }, ...townHalls.map((townHall) => ({ value: String(townHall), label: `TH${townHall}` }))]} /><FilterMenu label="Regular-war evidence" ariaLabel="Filter lineup members by regular-war evidence" value={regularActivityFilter} onChange={(value) => setRegularActivityFilter(value as RegularActivityFilter)} options={[{ value: "all", label: "All members" }, { value: "recent", label: "Evidence in last 90 days" }, { value: "observed", label: "Any observed activity" }, { value: "no-evidence", label: "No evidence yet" }]} /><FilterMenu label="Sort" ariaLabel="Sort season roster" value={rosterSort} onChange={(value) => setRosterSort(value as CwlRosterSort)} options={[{ value: "availability", label: "Availability" }, { value: "name", label: "Name" }, { value: "townHall", label: "Town Hall" }, { value: "role", label: "Role" }, { value: "rating", label: "CWL rating" }, { value: "regularActivity", label: "Regular activity" }]} /></div><div className="cwl-proto-pool-list">{filteredPool.map((member) => <PoolMember key={member.playerTag} member={member} locked={snapshot.plan.isLocked} onDragStart={dragStart} onAdd={() => addMember(member.playerTag)} onAvailabilityChange={(status) => void updateAvailability(member, status)} />)}{filteredPool.length === 0 ? <p className="cwl-proto-pool-empty">No roster members match these filters.</p> : null}</div></section>
      </div>
      <aside className="cwl-proto-right-rail"><RecommendationPanel snapshot={snapshot} draft={draft} locked={snapshot.plan.isLocked} changes={rotationChanges} previewActive={rotationPreviewBaseline !== null} onPreview={previewRotation} onRevert={revertRotationPreview} onApplyChange={applyRotationChange} /><BonusPriorityPanel members={snapshot.members} /><HistoryPanel snapshot={snapshot} /></aside>
    </div>
    <p className="cwl-proto-footnote">Planned state is saved here for leader coordination. No in-game lineup changes are sent automatically.</p>
  </main>;
}
