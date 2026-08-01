import { useEffect, useMemo, useState, type DragEvent } from "react";
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
} from "../data/operations.js";

const days = [1, 2, 3, 4, 5, 6, 7];
const availabilityCycle: Record<CwlAvailability, CwlAvailability> = {
  available: "unknown",
  unknown: "unavailable",
  unavailable: "available",
};

function availabilityLabel(value: CwlAvailability): string {
  return value === "available" ? "Available" : value === "unavailable" ? "Unavailable" : "Unknown";
}

function refreshedLabel(value: string | null): string {
  return value ? `Last refreshed ${new Date(value).toLocaleString()}` : "Last refreshed time unavailable";
}

function isStaleError(reason: unknown): boolean {
  return reason instanceof Error && reason.message.toLowerCase().includes("stale");
}

function memberEvidence(member: CwlLineupMember): string {
  const role = member.role === "elder" ? "Elder · " : member.role === "leader" ? "Leader · " : "";
  return `${role}TH${member.townHallLevel} · ${member.completedAttacks} / ${member.assignedAttacks} attacks · ${member.stars}★`;
}

function applyRecommendation(plan: string[], changes: Array<{ outPlayerTag: string; inPlayerTag: string }>): string[] {
  const next = [...plan];
  for (const change of changes) {
    const outIndex = next.indexOf(change.outPlayerTag);
    if (outIndex >= 0 && !next.includes(change.inPlayerTag)) next[outIndex] = change.inPlayerTag;
  }
  return next;
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

function AvailabilityControl({ member, onChange }: { member: CwlLineupMember; onChange: () => void }) {
  return <button
    className={`cwl-proto-availability-control availability-${member.availability}`}
    type="button"
    title={`${availabilityLabel(member.availability)}. Click to change availability.`}
    aria-label={`Change ${member.name} availability from ${availabilityLabel(member.availability)}`}
    onClick={onChange}
  >
    {member.availability === "available" ? "A" : member.availability === "unknown" ? "?" : "—"}
  </button>;
}

function MemberBadge({ member }: { member: CwlLineupMember }) {
  return <span className="cwl-proto-member-badge">
    <strong>{member.name}</strong>
    <small>{memberEvidence(member)}</small>
  </span>;
}

function DayStrip({ day, onChange }: { day: number; onChange: (day: number) => void }) {
  return <div className="cwl-proto-day-strip" aria-label="CWL war days">
    {days.map((item) => <button key={item} className={item === day ? "selected" : ""} type="button" onClick={() => onChange(item)}>
      <span>Day {item}</span><small>{item < day ? "Complete" : item === day ? "Today" : "Upcoming"}</small>
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
  onAvailabilityChange: () => void;
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
    <span className="cwl-proto-slot-state">{observed ? "Observed" : "Planned"}</span>
    <AvailabilityControl member={member} onChange={onAvailabilityChange} />
    {!locked ? <button type="button" aria-label={`Bench ${member.name}`} onClick={onRemove}>×</button> : null}
  </div>;
}

function PoolMember({ member, locked, onDragStart, onAdd, onAvailabilityChange }: {
  member: CwlLineupMember;
  locked: boolean;
  onDragStart: (event: DragEvent<HTMLDivElement>, playerTag: string) => void;
  onAdd: () => void;
  onAvailabilityChange: () => void;
}) {
  return <div
    className={`cwl-proto-pool-member availability-${member.availability}`}
    draggable={!locked}
    onDragStart={(event) => onDragStart(event, member.playerTag)}
  >
    <span className="cwl-proto-pool-avatar">{member.name.slice(0, 1)}</span>
    <span><strong>{member.name}</strong><small>{memberEvidence(member)}</small></span>
    <AvailabilityControl member={member} onChange={onAvailabilityChange} />
    <button className="cwl-proto-pool-action" type="button" disabled={locked} onClick={onAdd}>Add</button>
  </div>;
}

function RecommendationPanel({ snapshot, locked, onPreview }: { snapshot: CwlLineupWorkspaceSnapshot; locked: boolean; onPreview: () => void }) {
  const recommendation = snapshot.recommendation;
  return <section className="cwl-proto-panel cwl-proto-recommendation" aria-label="Recommendation">
    <div className="cwl-proto-panel-heading"><div><p className="eyebrow">Recommendation</p><h2>{recommendation?.changes.length ? "Review rotation opportunities" : "No current proposal"}</h2></div>{recommendation ? <span className="cwl-proto-confidence">Preview</span> : null}</div>
    <p className="cwl-proto-panel-lede">Recommendations preview possible changes from availability, attack evidence, rotation goals, Town Hall fit, and current role data. They never change the plan or game automatically.</p>
    {recommendation?.changes.slice(0, 3).map((change) => <div className="cwl-proto-recommendation-row" key={`${change.outPlayerTag}:${change.inPlayerTag}`}>
      <span className="cwl-proto-member-badge"><strong>{change.outPlayerTag}</strong><small>Review</small></span>
      <span className="cwl-proto-arrow">→</span>
      <span className="cwl-proto-member-badge"><strong>{change.inPlayerTag}</strong><small>{change.explanation || "Availability-first candidate"}</small></span>
    </div>)}
    {recommendation ? <button className="cwl-proto-primary-button" type="button" disabled={locked || recommendation.changes.length === 0} onClick={onPreview}>Preview recommended changes</button> : null}
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
      <div><strong>{event.label}</strong><small>{event.actorName} · {new Date(event.occurredAt).toLocaleString()}</small>{lineupAdjustmentSummary(event) ? <small>{lineupAdjustmentSummary(event)}</small> : null}</div>
    </li>)}</ul>
    <button className="cwl-proto-history-button" type="button" aria-expanded={showAll} onClick={() => setShowAll((value) => !value)}>{showAll ? "Show summary" : "View all lineup updates"}</button>
  </section>;
}

export function CwlLineupWorkspacePage({ client, clanTag }: { client: any; clanTag: string }) {
  const [day, setDay] = useState<number>();
  const [snapshot, setSnapshot] = useState<CwlLineupWorkspaceSnapshot>();
  const [draft, setDraft] = useState<string[]>([]);
  const [stale, setStale] = useState(false);
  const [message, setMessage] = useState("Loading the daily plan…");
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setError(undefined);
    try {
      const next = await loadCurrentCwlLineupWorkspace(client, clanTag, day);
      if (day === undefined) setDay(next.plan.warDay);
      setSnapshot(next);
      setDraft(next.plan.playerTags);
      setStale(false);
      setMessage(`Day ${day} is ready. Availability changes apply to the season and do not change this plan automatically.`);
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
  const pool = useMemo(() => (snapshot?.members ?? []).filter((member) => !draft.includes(member.playerTag)).sort((left, right) => {
    const availabilityOrder = { available: 0, unknown: 1, unavailable: 2 };
    return availabilityOrder[left.availability] - availabilityOrder[right.availability] || left.name.localeCompare(right.name);
  }), [draft, snapshot]);
  const dirty = Boolean(snapshot && JSON.stringify(draft) !== JSON.stringify(snapshot.plan.playerTags));

  if (loading && !snapshot) return <main className="dashboard-shell"><p role="status">Loading CWL lineup workspace…</p></main>;
  if (error && !snapshot) return <main className="dashboard-shell"><div role="alert">{error}</div></main>;
  if (!snapshot || day === undefined) return null;

  const updateAvailability = async (member: CwlLineupMember) => {
    const nextAvailability = availabilityCycle[member.availability];
    try {
      await saveAvailability(client, { clanTag, seasonId: snapshot.season.seasonId, playerTag: member.playerTag, status: nextAvailability, note: "" });
      setSnapshot((current) => current ? { ...current, members: current.members.map((item) => item.playerTag === member.playerTag ? { ...item, availability: nextAvailability } : item) } : current);
      setMessage(`${member.name} marked ${availabilityLabel(nextAvailability)}. The lineup was not changed.`);
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Unable to save availability."); }
  };

  const addMember = (playerTag: string) => { if (!snapshot.plan.isLocked && !draft.includes(playerTag)) setDraft((current) => [...current, playerTag]); };
  const removeMember = (playerTag: string) => { if (!snapshot.plan.isLocked) setDraft((current) => current.filter((tag) => tag !== playerTag)); };
  const dragStart = (event: DragEvent<HTMLDivElement>, playerTag: string) => { event.dataTransfer.setData("text/plain", playerTag); };
  const drop = (event: DragEvent<HTMLDivElement>, index: number) => {
    event.preventDefault();
    if (snapshot.plan.isLocked) return;
    const playerTag = event.dataTransfer.getData("text/plain");
    if (!playerTag || !memberByTag.has(playerTag)) return;
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
      setStale(false);
      setMessage(`Day ${day} copied Day ${day - 1}. Review the independent snapshot before saving further edits.`);
    } catch (reason) {
      setStale(isStaleError(reason));
      setMessage(reason instanceof Error ? reason.message : "Unable to re-inherit the lineup plan.");
    }
  };

  const previewRecommendation = () => {
    if (!snapshot.recommendation) return;
    setDraft((current) => applyRecommendation(current, snapshot.recommendation!.changes));
    setMessage("Recommendation preview applied locally. Save the plan only after leader review.");
  };

  return <main className="cwl-proto-shell cwl-proto-variant-a">
    <header className="cwl-proto-header">
      <div><p className="eyebrow">CWL operations · {snapshot.season.seasonId}</p><h1>Lineup workspace</h1><p>Review member intent, make the daily plan, and compare it with what the Clash API observed in-game.</p><p className="cwl-proto-freshness">{refreshedLabel(snapshot.freshness.lastRefreshedAt)}{snapshot.freshness.collectionStatus ? ` · Collection ${snapshot.freshness.collectionStatus}` : ""}</p></div>
      <div className="cwl-proto-header-actions"><span className={`cwl-proto-lock ${snapshot.plan.isLocked ? "is-locked" : ""}`}>{snapshot.plan.isLocked ? "🔒 Locked" : "Unlocked"}<small>Day {day} · rev {snapshot.plan.revision}</small></span><button className="cwl-proto-secondary-button" type="button" onClick={() => void toggleLock()}>{snapshot.plan.isLocked ? "Unlock day" : "Lock day"}</button></div>
    </header>
    <DayStrip day={day} onChange={setDay} />
    <div className="cwl-proto-inline-notice"><span><strong>Planned lineup</strong> is the editable leader plan. <strong>Observed lineup</strong> comes from the Clash API after the war starts. Each new day inherits once, then stays independent.</span><button type="button" disabled={snapshot.plan.isLocked || day === 1} onClick={() => void reinherit()}>Re-inherit prior day</button></div>
    <StatusBar snapshot={snapshot} dirty={dirty} stale={stale} message={message} onReload={() => void load()} onSave={() => void save()} />
    {error ? <div className="cwl-proto-status is-stale" role="alert"><strong>{error}</strong></div> : null}
    <div className="cwl-proto-command-grid">
      <div className="cwl-proto-plan-board">
        <section className="cwl-proto-panel cwl-proto-plan-panel"><div className="cwl-proto-panel-heading"><div><p className="eyebrow">Day {day} plan</p><h2>{draft.length} planned · drag to reorder</h2></div><span className="cwl-proto-count">{draft.length} / {snapshot.season.warSize}</span></div><div className="cwl-proto-slot-grid">{planned.map((member, index) => <LineupSlot key={member.playerTag} member={member} index={index} observed={member.observed} locked={snapshot.plan.isLocked} onDrop={drop} onDragStart={dragStart} onRemove={() => removeMember(member.playerTag)} onAvailabilityChange={() => void updateAvailability(member)} />)}</div></section>
        <section className="cwl-proto-panel cwl-proto-pool-panel"><div className="cwl-proto-panel-heading"><div><p className="eyebrow">Season roster</p><h2>Substitute pool</h2></div><div className="cwl-proto-panel-heading-actions"><a href="#/availability">Update availability</a><span className="cwl-proto-count">{pool.length}</span></div></div><p className="cwl-proto-help">Availability is season-scoped and remains editable while this daily plan is locked. Changing it never changes lineup membership automatically.</p><div className="cwl-proto-pool-list">{pool.map((member) => <PoolMember key={member.playerTag} member={member} locked={snapshot.plan.isLocked} onDragStart={dragStart} onAdd={() => addMember(member.playerTag)} onAvailabilityChange={() => void updateAvailability(member)} />)}</div></section>
      </div>
      <aside className="cwl-proto-right-rail"><RecommendationPanel snapshot={snapshot} locked={snapshot.plan.isLocked} onPreview={previewRecommendation} /><section className="cwl-proto-panel cwl-proto-context-panel"><div className="cwl-proto-panel-heading"><div><p className="eyebrow">Observed vs planned</p><h2>API context</h2></div></div><p className="cwl-proto-panel-lede">Observed assignments never overwrite the plan. They are facts to compare after leaders make the in-game change.</p><div className="cwl-proto-comparison"><div><span>Planned in app</span><strong>{draft.length}</strong></div><div><span>Observed in game</span><strong>{snapshot.observed.length}</strong></div><div><span>Differences to review</span><strong>{snapshot.observed.filter((row) => !draft.includes(row.playerTag)).length + draft.filter((tag) => !snapshot.observed.some((row) => row.playerTag === tag)).length}</strong></div></div></section><HistoryPanel snapshot={snapshot} /></aside>
    </div>
    <p className="cwl-proto-footnote">Planned state is saved here for leader coordination. No in-game lineup changes are sent automatically.</p>
  </main>;
}
