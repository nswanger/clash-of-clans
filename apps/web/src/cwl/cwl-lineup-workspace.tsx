/* The CWL lineup workspace, rebuilt on Clan Muster (#25, wave 2).
 *
 * Spec: design/prototype/lineup-adjust.html. Ported near-verbatim, because the
 * prototype is the spec and a direct port verifies the design by construction.
 *
 * This is the deadline surface: it is the default route and the only one
 * validated against a live season, so #25 required it to move between seasons
 * rather than during one.
 *
 * Three things the live workspace did not have arrive with it — the swap panel,
 * reorder mode, and the in-game checklist (#21, persisted by #36). One thing
 * leaves: see "the rotation queue" note below.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppTopbar } from "../app-chrome.js";
import { Icon } from "../design/icon.js";
import { Sheet } from "../design/sheet.js";
import {
  clearCwlAppliedLineupChanges,
  CWL_WAR_DAYS,
  loadCurrentCwlLineupWorkspace,
  recordCwlAppliedLineupChange,
  reinheritCwlLineupPlan,
  saveAvailability,
  saveCwlLineupPlan,
  setCwlLineupPlanLock,
  undoCwlAppliedLineupChange,
  type CwlAppliedLineupBaseline,
  type CwlAvailability,
  type CwlLineupHistoryEvent,
  type CwlLineupMember,
  type CwlLineupWorkspaceSnapshot,
  type CwlWarState,
} from "../data/operations.js";
import { CwlPhaseStrip } from "./cwl-phase-strip.js";
import type { CwlPhase } from "./cwl-phase.js";
import "./cwl-lineup-workspace.css";

const DAYS = Array.from({ length: CWL_WAR_DAYS }, (_, index) => index + 1);
const WIDE_QUERY = "(min-width: 720px)";
export const CWL_BONUS_STAR_THRESHOLD = 8;

/* ---------------------------------------------------------------------------
 * Derivations
 * ------------------------------------------------------------------------- */

export function isBonusSecured(member: CwlLineupMember): boolean {
  return member.stars >= CWL_BONUS_STAR_THRESHOLD;
}

/* No `observed` term, unlike the predicate this replaces. The prototype asks
 * only whether someone is owed a turn; whether they are in the observed war is
 * a fact about this day, and it is already carried by the row's provenance
 * rail. Folding it in here made an available member with no assignments read as
 * not needing a turn purely because a different day had started. */
export function needsBonusTurn(member: CwlLineupMember): boolean {
  return member.availability === "available"
    && member.stars < CWL_BONUS_STAR_THRESHOLD
    && member.assignedAttacks === 0;
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

const availabilityRank = (member: CwlLineupMember): number =>
  member.availability === "available" ? 0 : member.availability === "unknown" ? 1 : 2;

const rotationRank = (member: CwlLineupMember): number =>
  needsBonusTurn(member) ? 0 : isBonusSecured(member) ? 2 : 1;

/* Availability dominates — an unavailable member is not a candidate at all —
 * and rotation need outranks raw strength, because swapping in someone already
 * at 8★ does nothing for bonus fairness. Ranking by rating alone floats the
 * secured members to the top, which is exactly backwards. */
export function sortCandidates(left: CwlLineupMember, right: CwlLineupMember): number {
  return (availabilityRank(left) - availabilityRank(right))
    || (rotationRank(left) - rotationRank(right))
    || ((right.overallRating ?? -1) - (left.overallRating ?? -1))
    || left.name.localeCompare(right.name);
}

export function rankCandidates(members: CwlLineupMember[], draft: string[], search: string): CwlLineupMember[] {
  const query = search.trim().toLocaleLowerCase();
  return members
    .filter((member) => !draft.includes(member.playerTag))
    .filter((member) => !query || member.name.toLocaleLowerCase().includes(query))
    .sort(sortCandidates);
}

export interface MembershipDiff {
  swaps: Array<{ out: string; in: string }>;
  added: string[];
  removed: string[];
}

/* A removal and an addition are one swap wherever they can be paired, because
 * that is one act in the game and gets one check control. Pairing is positional
 * and arbitrary — the game does not care who replaces whom — so this is a
 * presentation of the diff, not a claim about intent. */
export function membershipDiff(from: string[], to: string[]): MembershipDiff {
  const removed = from.filter((tag) => !to.includes(tag));
  const incoming = to.filter((tag) => !from.includes(tag));
  const swaps: Array<{ out: string; in: string }> = [];
  const added: string[] = [];
  const unpaired = [...removed];
  for (const tag of incoming) {
    const partner = unpaired.shift();
    if (partner) swaps.push({ out: partner, in: tag });
    else added.push(tag);
  }
  return { swaps, added, removed: unpaired };
}

export interface ChecklistItem {
  key: string;
  out?: string;
  in?: string;
}

/* The checklist is `saved plan − baseline`, never `draft − saved`: what is left
 * to do in Clash is a different question from what is unsaved, with a different
 * baseline. Merging them is what made the old draft's checklist evaporate on
 * Save — the exact moment you switch to the game to act on it.
 *
 * Order changes are absent by design. The game orders by base weight, which it
 * decides; a move in the plan is you transcribing what Clash already shows,
 * never an instruction to carry back.
 *
 * Removals lead: at war size the game refuses an add before a remove, so the
 * order the rows are listed in is the order they can actually be executed. */
export function pendingChecklist(baseline: string[], saved: string[]): ChecklistItem[] {
  const diff = membershipDiff(baseline, saved);
  return [
    ...diff.swaps.map((swap) => ({ key: `swap:${swap.out}>${swap.in}`, out: swap.out, in: swap.in })),
    ...diff.removed.map((tag) => ({ key: `rm:${tag}`, out: tag })),
    ...diff.added.map((tag) => ({ key: `add:${tag}`, in: tag })),
  ];
}

export function unsavedChangeCount(saved: string[], draft: string[], moved: ReadonlySet<string>): number {
  const diff = membershipDiff(saved, draft);
  /* Moves count per member, and only for members already in the saved plan —
   * someone swapped in is a swap, not also a move. */
  const movedCount = [...moved].filter((tag) => saved.includes(tag) && draft.includes(tag)).length;
  return diff.swaps.length + diff.added.length + diff.removed.length + movedCount;
}

/* Fires only when the plan moved under a checklist you are part-way through. An
 * untouched list just recomputes — nothing was invalidated. */
export function hasRevisionConflict(listRevision: number, planRevision: number, appliedCount: number): boolean {
  return listRevision !== planRevision && appliedCount > 0;
}

/* ---------------------------------------------------------------------------
 * Labels
 * ------------------------------------------------------------------------- */

function roleLabel(value: CwlLineupMember["role"]): string {
  return value === "coLeader" ? "Co-leader"
    : value === "elder" ? "Elder"
    : value === "leader" ? "Leader"
    : value === "member" ? "Member"
    : "Unknown";
}

function availabilityLabel(value: CwlAvailability): string {
  return value === "available" ? "Available" : value === "unavailable" ? "Unavailable" : "Unknown";
}

function warDayStatus(state: CwlWarState | undefined): string {
  return state === "warEnded" ? "Complete"
    : state === "inWar" ? "In war"
    : state === "preparation" ? "Planning"
    : "Upcoming";
}

function isStaleError(reason: unknown): boolean {
  return reason instanceof Error && reason.message.toLocaleLowerCase().includes("stale");
}

function errorText(reason: unknown, fallback: string): string {
  return reason instanceof Error ? reason.message : fallback;
}

function historySummary(event: CwlLineupHistoryEvent, nameOf: (tag: string) => string): string {
  if (event.eventType !== "lineup_plan_saved") return "";
  const list = (value: unknown) => Array.isArray(value) ? value.filter((tag): tag is string => typeof tag === "string") : [];
  if (!Object.hasOwn(event.eventData, "previousPlayerTags") || !Object.hasOwn(event.eventData, "playerTags")) return "";
  const previous = list(event.eventData.previousPlayerTags);
  const current = list(event.eventData.playerTags);
  const added = current.filter((tag) => !previous.includes(tag));
  const removed = previous.filter((tag) => !current.includes(tag));
  const orderChanged = added.length === 0 && removed.length === 0
    && previous.some((tag, index) => current[index] !== tag);
  return [
    added.length ? `Added ${added.map(nameOf).join(", ")}` : "",
    removed.length ? `Removed ${removed.map(nameOf).join(", ")}` : "",
    orderChanged ? "Order changed" : "",
  ].filter(Boolean).join(" · ");
}

/* ---------------------------------------------------------------------------
 * Rows
 * ------------------------------------------------------------------------- */

/* Mark the exception, never the rule. "Available" on thirteen of fifteen rows is
 * the happy-path banner again, one row at a time — so availability renders only
 * when it is unknown or unavailable, and a row with nothing to flag carries no
 * second line at all. */
function RowMeta({ member, observed }: { member: CwlLineupMember; observed: boolean }) {
  const marks = [
    member.availability !== "available"
      ? <span key="avail" className={`cm-statustext is-${member.availability}`}>{availabilityLabel(member.availability)}</span>
      : null,
    isBonusSecured(member)
      ? <span key="secured" className="cm-pill is-success"><span>8<Icon name="star" /></span>secured</span>
      : needsBonusTurn(member)
        ? <span key="turn" className="cm-pill is-caution">Needs a turn</span>
        : null,
    observed && member.currentWarAssignedAttacks > 0
      ? <span key="attacks">{member.currentWarAttacksMade}/{member.currentWarAssignedAttacks} attacks</span>
      : null,
  ].filter(Boolean);
  if (marks.length === 0) return null;
  return <span className="cm-row-meta">{marks}</span>;
}

function MemberRow({ member, position, edited, out, onOpen }: {
  member: CwlLineupMember;
  position?: number;
  edited?: boolean;
  out?: boolean;
  onOpen: () => void;
}) {
  const classes = ["cm-row"];
  if (position !== undefined) classes.push("has-pos");
  if (member.observed) classes.push("is-observed");
  if (out) classes.push("is-out");
  return <button className={classes.join(" ")} type="button" onClick={onOpen}>
    {position === undefined ? null : <span className={`cm-row-pos ${edited ? "is-edited" : ""}`}>{position}</span>}
    <span className="cm-row-main">
      <span className="cm-row-name">{member.name}</span>
      <RowMeta member={member} observed={member.observed} />
    </span>
    <span className="cm-row-stats">
      <span className="cm-row-figure">{member.stars}<Icon name="star" /></span>
      <span className="cm-row-th">TH{member.townHallLevel}</span>
    </span>
    <span className="cm-chev" aria-hidden="true"><Icon name="chevron" /></span>
  </button>;
}

/* Reorder mode. Matching in-game order is a bulk task — you look at the game,
 * come back, and move several people — so it gets its own mode rather than a
 * per-row affordance. Rows collapse to number, name and handle, which roughly
 * doubles how many fit on a phone screen while you compare against the game. */
function ReorderRow({ member, index, wasIndex, moved }: {
  member: CwlLineupMember;
  index: number;
  wasIndex: number;
  moved: boolean;
}) {
  return <div className="cm-reorder-row" data-tag={member.playerTag}>
    <span className={`cm-row-pos ${moved ? "is-edited" : ""}`}>{index + 1}</span>
    <span className="cm-row-name">{member.name}</span>
    <span className="cwl-moved-from">{moved && wasIndex >= 0 ? `was ${wasIndex + 1}` : ""}</span>
    <span className="cm-row-th">TH{member.townHallLevel}</span>
    <span className="cm-handle" data-handle aria-label={`Reorder ${member.name}`}><Icon name="grip" /></span>
  </div>;
}

/* ---------------------------------------------------------------------------
 * Panels
 * ------------------------------------------------------------------------- */

function CandidateList({ candidates, search, onSearch, onChoose }: {
  candidates: CwlLineupMember[];
  search: string;
  onSearch: (value: string) => void;
  onChoose: (playerTag: string) => void;
}) {
  return <>
    <input
      className="cm-search"
      type="search"
      placeholder="Find a member"
      aria-label="Find a member"
      value={search}
      onChange={(event) => onSearch(event.target.value)}
    />
    <div className="cm-rows">
      {candidates.length
        ? candidates.map((candidate) => <MemberRow key={candidate.playerTag} member={candidate} onOpen={() => onChoose(candidate.playerTag)} />)
        : <p className="cm-empty">No one matches “{search}”.</p>}
    </div>
  </>;
}

function SwapPanel({ member, candidates, search, locked, onSearch, onChoose, onAvailability, onBench, onClose }: {
  member: CwlLineupMember;
  candidates: CwlLineupMember[];
  search: string;
  locked: boolean;
  onSearch: (value: string) => void;
  onChoose: (playerTag: string) => void;
  onAvailability: (value: CwlAvailability) => void;
  onBench: () => void;
  onClose: () => void;
}) {
  return <div className="cm-panel" role="dialog" aria-modal="true" aria-label={member.name}>
    <div className="cm-panel-head">
      <div className="cm-grow">
        <h2>{member.name}</h2>
        <p className="cm-panel-evidence">
          {roleLabel(member.role)} <span className="cm-sep">·</span> TH{member.townHallLevel} <span className="cm-sep">·</span>{" "}
          <b>{member.stars}<Icon name="star" /></b> across {member.cwlWarsParticipated} CWL war{member.cwlWarsParticipated === 1 ? "" : "s"}<br />
          {member.overallRating === null ? "No CWL rating yet" : <><b>{Math.round(member.overallRating)}</b> CWL rating</>} <span className="cm-sep">·</span>{" "}
          {member.regularActivityScore === null
            ? "No regular-war evidence"
            : <><b>{member.regularActivityScore}%</b> regular activity over {member.regularWarsParticipated} wars</>}
          {member.observed && member.currentWarAssignedAttacks > 0
            ? <><br /><b>{member.currentWarAttacksMade} / {member.currentWarAssignedAttacks}</b> attacks observed this war</>
            : null}
        </p>
      </div>
      <button className="cm-iconbutton" type="button" data-close aria-label="Close" onClick={onClose}><Icon name="close" /></button>
    </div>
    <div className="cm-panel-body">
      <p className="cm-panel-label">Availability</p>
      <div className="cm-availset">
        {(["available", "unknown", "unavailable"] as const).map((value) => <button
          key={value}
          type="button"
          aria-pressed={member.availability === value}
          onClick={() => onAvailability(value)}
        >{availabilityLabel(value)}</button>)}
      </div>
      <p className="cm-panel-label">Replace with</p>
      <CandidateList candidates={candidates} search={search} onSearch={onSearch} onChoose={onChoose} />
    </div>
    <div className="cm-panel-foot">
      <button className="cm-ghost" type="button" disabled={locked} onClick={onBench}>Bench {member.name} without a replacement</button>
    </div>
  </div>;
}

function BenchPanel({ candidates, benchSize, search, onSearch, onChoose, onClose }: {
  candidates: CwlLineupMember[];
  benchSize: number;
  search: string;
  onSearch: (value: string) => void;
  onChoose: (playerTag: string) => void;
  onClose: () => void;
}) {
  return <div className="cm-panel" role="dialog" aria-modal="true" aria-label="Bench">
    <div className="cm-panel-head">
      <div className="cm-grow">
        <h2>Bench</h2>
        <p className="cm-panel-evidence">{candidates.length} of {benchSize} shown <span className="cm-sep">·</span> ranked by rotation need, then availability</p>
      </div>
      <button className="cm-iconbutton" type="button" data-close aria-label="Close" onClick={onClose}><Icon name="close" /></button>
    </div>
    <div className="cm-panel-body">
      <CandidateList candidates={candidates} search={search} onSearch={onSearch} onChoose={onChoose} />
    </div>
  </div>;
}

function CheckRow({ item, done, nameOf, onToggle }: {
  item: ChecklistItem;
  done: boolean;
  nameOf: (tag: string) => string;
  onToggle: () => void;
}) {
  const body = item.out && item.in
    ? <>
        <span className="cm-check-out">{nameOf(item.out)}</span>
        <span className="cm-check-arrow"><Icon name="arrow-right" /></span>
        <span className="cm-check-in">{nameOf(item.in)}</span>
      </>
    : item.out
      ? <span className="cm-check-out">Remove {nameOf(item.out)}</span>
      : <span className="cm-check-in">Add {nameOf(item.in ?? "")}</span>;
  return <button className={`cm-check ${done ? "is-done" : ""}`} type="button" data-check={item.key} onClick={onToggle}>
    <span className="cm-check-box" aria-hidden="true"><Icon name="check" /></span>
    <span className="cm-check-swap">{body}</span>
    <span className="cm-check-undo">{done ? "Undo" : ""}</span>
  </button>;
}

function ChecklistPanel({ todo, done, nameOf, onCheck, onUndo, onClear, onClose }: {
  todo: ChecklistItem[];
  done: Array<{ sequence: number; item: ChecklistItem }>;
  nameOf: (tag: string) => string;
  onCheck: (item: ChecklistItem) => void;
  onUndo: (sequence: number) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  return <div className="cm-panel" role="dialog" aria-modal="true" aria-label="In game">
    <div className="cm-panel-head">
      <div className="cm-grow">
        <h2>In game</h2>
        <p className="cm-panel-evidence">{todo.length
          ? `${todo.length} left · tap each one as you make it in Clash`
          : `All ${done.length} made · this clears itself when collection sees the war`}</p>
      </div>
      <button className="cm-iconbutton" type="button" data-close aria-label="Close" onClick={onClose}><Icon name="close" /></button>
    </div>
    <div className="cm-panel-body">
      {todo.length
        ? <div className="cm-checkgroup">
            <p>To do</p>
            {todo.map((item) => <CheckRow key={item.key} item={item} done={false} nameOf={nameOf} onToggle={() => onCheck(item)} />)}
          </div>
        : null}
      {done.length
        ? <div className="cm-checkgroup">
            <p>Done</p>
            {done.map((entry) => <CheckRow key={entry.item.key} item={entry.item} done nameOf={nameOf} onToggle={() => onUndo(entry.sequence)} />)}
          </div>
        : null}
      {todo.length === 0 ? <p className="cwl-checkdone">The plan and the game agree.</p> : null}
    </div>
    {todo.length === 0
      ? <div className="cm-panel-foot"><button className="cm-ghost" type="button" onClick={onClear}>Clear this list</button></div>
      : null}
  </div>;
}

/* ---------------------------------------------------------------------------
 * The page
 * ------------------------------------------------------------------------- */

type Panel = null | { mode: "swap"; tag: string } | { mode: "bench" } | { mode: "changes" };

const EDGE_ZONE = 96; // how deep the auto-scroll band reaches from each edge
const EDGE_SPEED = 520; // px per SECOND, not per frame — a per-frame step runs at
                        // double speed on a 120Hz ProMotion phone

function useWide(): boolean {
  const [wide, setWide] = useState(() => window.matchMedia?.(WIDE_QUERY).matches ?? false);
  useEffect(() => {
    const query = window.matchMedia?.(WIDE_QUERY);
    if (!query) return;
    const onChange = (event: MediaQueryListEvent) => setWide(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return wide;
}

export function CwlLineupWorkspacePage({ client, clanTag, phase, onPhase, initialDay }: {
  client: any;
  clanTag: string;
  /* The phase this route is in, and how to leave it (ADR 0002). Wave 3 turned
     this from a page into one phase of a route; nothing else about the workspace
     moved. */
  phase: CwlPhase;
  onPhase: (next: CwlPhase) => void;
  /* The day to open on, resolved ONCE by the route from the war states it
     already loaded. It used to be derived here too, from a second query with the
     same rule — which made the phase strip's "Lineup · Day 3" a promise a
     different derivation was free to break. One rule, one place, and one fewer
     round trip. */
  initialDay: number;
}) {
  const wide = useWide();
  const [day, setDay] = useState<number>(initialDay);
  const [snapshot, setSnapshot] = useState<CwlLineupWorkspaceSnapshot>();
  const [draft, setDraft] = useState<string[]>([]);
  /* Which members were actually dragged. Moving one row past another changes
   * BOTH rows' indices, so a positional diff marks two rows for one move and
   * you lose track of what you touched — the mark follows intent, not index.
   * Same lifetime as the draft: a reload discards both together. */
  const [movedTags, setMovedTags] = useState<ReadonlySet<string>>(() => new Set());
  const [baseline, setBaseline] = useState<CwlAppliedLineupBaseline>();
  const [listRevision, setListRevision] = useState(0);
  const [panel, setPanel] = useState<Panel>(null);
  const [search, setSearch] = useState("");
  const [reordering, setReordering] = useState(false);
  const [dayMenuOpen, setDayMenuOpen] = useState(false);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string>();
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const next = await loadCurrentCwlLineupWorkspace(client, clanTag, day);
      setSnapshot(next);
      setDraft(next.plan.playerTags);
      setBaseline(next.appliedBaseline);
      setListRevision(next.plan.revision);
      setMovedTags(new Set());
      setStale(false);
      setStatus("");
    } catch (reason) {
      setError(errorText(reason, "Unable to load the CWL lineup workspace."));
    } finally {
      setLoading(false);
    }
  }, [client, clanTag, day]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setPanel(null);
      setSearch("");
      setDayMenuOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const memberByTag = useMemo(
    () => new Map((snapshot?.members ?? []).map((member) => [member.playerTag, member])),
    [snapshot],
  );
  const nameOf = useCallback((tag: string) => memberByTag.get(tag)?.name ?? "Unknown member", [memberByTag]);
  const saved = snapshot?.plan.playerTags ?? [];
  const planned = useMemo(
    () => draft.flatMap((tag) => { const member = memberByTag.get(tag); return member ? [member] : []; }),
    [draft, memberByTag],
  );
  const candidates = useMemo(
    () => rankCandidates(snapshot?.members ?? [], draft, search),
    [draft, search, snapshot],
  );
  const todo = useMemo(() => pendingChecklist(baseline?.playerTags ?? [], saved), [baseline, saved]);
  /* The done list is the server's record replayed into the same row shape the
   * to-do list uses, so a checked item does not change form when it moves
   * groups. Each keeps its sequence, because any act can be undone. */
  const done = useMemo(() => (baseline?.appliedChanges ?? []).map((change) => ({
    sequence: change.changeSequence,
    item: {
      key: change.removedPlayerTag && change.addedPlayerTag
        ? `swap:${change.removedPlayerTag}>${change.addedPlayerTag}`
        : change.removedPlayerTag ? `rm:${change.removedPlayerTag}` : `add:${change.addedPlayerTag}`,
      ...(change.removedPlayerTag ? { out: change.removedPlayerTag } : {}),
      ...(change.addedPlayerTag ? { in: change.addedPlayerTag } : {}),
    } satisfies ChecklistItem,
  })), [baseline]);

  const locked = snapshot?.plan.isLocked ?? false;
  const unsaved = unsavedChangeCount(saved, draft, movedTags);
  const conflict = hasRevisionConflict(listRevision, snapshot?.plan.revision ?? 0, done.length);

  /* ---- reorder drag ----
   * Pointer-based, not HTML5 drag-and-drop, which fires no events at all on
   * touch — so the phone has never been able to reorder. Pointer capture is
   * taken on the list rather than the handle, so the drag survives the
   * re-render each move triggers.
   */
  const listRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ tag: string; y: number; carry: number; last: number | null } | null>(null);
  const frameRef = useRef<number | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const resolveDropIndex = useCallback(() => {
    const drag = dragRef.current;
    const list = listRef.current;
    if (!drag || !list) return;
    const rows = [...list.querySelectorAll<HTMLElement>(".cm-reorder-row")];
    if (rows.length < 2) return;
    const first = rows[0]!.getBoundingClientRect();
    const pitch = rows[1]!.getBoundingClientRect().top - first.top;
    if (!pitch) return;
    const target = Math.max(0, Math.min(rows.length - 1, Math.round((drag.y - first.top) / pitch)));
    const from = draftRef.current.indexOf(drag.tag);
    if (from < 0 || target === from) return;
    const next = [...draftRef.current];
    next.splice(target, 0, ...next.splice(from, 1));
    setDraft(next);
  }, []);

  /* Only ten rows of fifteen fit on a phone, so a drag has to be able to leave
   * the screen. The pointer stops moving once it reaches the edge, so the
   * scroll cannot be driven by pointermove alone — a frame loop runs for the
   * life of the drag, scrolling while the pointer sits in the edge band and
   * re-resolving the drop index each frame from the last known position. */
  const tick = useCallback((now: number) => {
    const drag = dragRef.current;
    if (!drag) return;
    const elapsed = Math.min(0.05, (now - (drag.last ?? now)) / 1000); // clamp after a stall
    drag.last = now;

    const bottomEdge = window.innerHeight - EDGE_ZONE;
    // Depth into the band, 0 at the boundary and 1 at the screen edge. Quadratic
    // rather than linear so easing a thumb just inside the band creeps instead
    // of lurching, and full speed is reserved for the very edge.
    let depth = 0;
    if (drag.y < EDGE_ZONE) depth = -(EDGE_ZONE - drag.y) / EDGE_ZONE;
    else if (drag.y > bottomEdge) depth = (drag.y - bottomEdge) / EDGE_ZONE;

    if (depth) {
      drag.carry += Math.sign(depth) * depth * depth * EDGE_SPEED * elapsed;
      const step = Math.trunc(drag.carry); // keep the sub-pixel remainder
      if (step) { window.scrollBy(0, step); drag.carry -= step; }
    } else {
      drag.carry = 0;
    }

    resolveDropIndex();
    frameRef.current = requestAnimationFrame(tick);
  }, [resolveDropIndex]);

  useEffect(() => () => { if (frameRef.current !== null) cancelAnimationFrame(frameRef.current); }, []);

  const onListPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!reordering || locked) return;
    const handle = (event.target as Element).closest?.("[data-handle]");
    const row = handle?.closest<HTMLElement>(".cm-reorder-row");
    const tag = row?.dataset.tag;
    if (!tag) return;
    dragRef.current = { tag, y: event.clientY, carry: 0, last: null };
    listRef.current?.setPointerCapture?.(event.pointerId);
    row?.classList.add("is-lifted");
    event.preventDefault();
    frameRef.current = requestAnimationFrame(tick);
  };

  const onListPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current.y = event.clientY;
    resolveDropIndex();
  };

  const endDrag = () => {
    if (frameRef.current !== null) { cancelAnimationFrame(frameRef.current); frameRef.current = null; }
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    // dragged back to where it started is not a move
    const returned = draftRef.current.indexOf(drag.tag) === saved.indexOf(drag.tag);
    setMovedTags((current) => {
      const next = new Set(current);
      if (returned) next.delete(drag.tag); else next.add(drag.tag);
      return next;
    });
  };

  /* ---- mutations ---- */

  const editLineup = (next: string[]) => { if (!locked) setDraft(next); };

  const chooseCandidate = (playerTag: string) => {
    if (locked) return;
    if (panel?.mode === "swap") {
      const outgoing = panel.tag;
      editLineup(draft.map((tag) => tag === outgoing ? playerTag : tag));
      setPanel(null);
    } else if (draft.length < (snapshot?.season.warSize ?? 0)) {
      editLineup([...draft, playerTag]);
    }
    setSearch("");
  };

  const benchMember = (playerTag: string) => {
    editLineup(draft.filter((tag) => tag !== playerTag));
    setPanel(null);
    setSearch("");
  };

  const updateAvailability = async (member: CwlLineupMember, next: CwlAvailability) => {
    if (!snapshot) return;
    try {
      await saveAvailability(client, { clanTag, seasonId: snapshot.season.seasonId, playerTag: member.playerTag, status: next, note: "" });
      setSnapshot((current) => current
        ? { ...current, members: current.members.map((item) => item.playerTag === member.playerTag ? { ...item, availability: next } : item) }
        : current);
    } catch (reason) { setStatus(errorText(reason, "Unable to save availability.")); }
  };

  /* Save advances the plan of record. The game has not moved, so the baseline
   * does not either — which is the whole finding of #21: the work to do in
   * Clash appears here rather than vanishing. */
  const save = async () => {
    if (!snapshot) return;
    try {
      const plan = await saveCwlLineupPlan(client, {
        clanTag, seasonId: snapshot.season.seasonId, warDay: day,
        expectedRevision: snapshot.plan.revision, playerTags: draft,
      });
      setSnapshot((current) => current ? { ...current, plan } : current);
      setDraft(plan.playerTags);
      setListRevision(plan.revision);
      setMovedTags(new Set());
      setStale(false);
      setStatus(`Day ${day} plan saved at revision ${plan.revision}.`);
    } catch (reason) {
      setStale(isStaleError(reason));
      setStatus(errorText(reason, "Unable to save the lineup plan."));
    }
  };

  const toggleLock = async () => {
    if (!snapshot) return;
    setDayMenuOpen(false);
    try {
      const plan = await setCwlLineupPlanLock(client, {
        clanTag, seasonId: snapshot.season.seasonId, warDay: day,
        expectedRevision: snapshot.plan.revision, isLocked: !snapshot.plan.isLocked,
      });
      setSnapshot((current) => current ? { ...current, plan } : current);
      setStale(false);
      setStatus(plan.isLocked ? `Day ${day} is locked. Availability remains editable.` : `Day ${day} is unlocked for lineup edits.`);
    } catch (reason) {
      setStale(isStaleError(reason));
      setStatus(errorText(reason, "Unable to change the lineup lock."));
    }
  };

  const reinherit = async () => {
    if (!snapshot || day <= 1 || locked) return;
    setDayMenuOpen(false);
    try {
      const plan = await reinheritCwlLineupPlan(client, {
        clanTag, seasonId: snapshot.season.seasonId, warDay: day, expectedRevision: snapshot.plan.revision,
      });
      setSnapshot((current) => current ? { ...current, plan } : current);
      setDraft(plan.playerTags);
      setListRevision(plan.revision);
      setMovedTags(new Set());
      setStale(false);
      setStatus(`Day ${day} copied Day ${day - 1}. Review the independent snapshot before saving further edits.`);
    } catch (reason) {
      setStale(isStaleError(reason));
      setStatus(errorText(reason, "Unable to re-inherit the lineup plan."));
    }
  };

  const checkOff = async (item: ChecklistItem) => {
    if (!snapshot) return;
    try {
      setBaseline(await recordCwlAppliedLineupChange(client, {
        clanTag, seasonId: snapshot.season.seasonId, warDay: day,
        removedPlayerTag: item.out ?? null, addedPlayerTag: item.in ?? null,
      }));
    } catch (reason) { setStatus(errorText(reason, "Unable to record that change.")); }
  };

  const undoCheck = async (changeSequence: number) => {
    if (!snapshot) return;
    try {
      setBaseline(await undoCwlAppliedLineupChange(client, { clanTag, seasonId: snapshot.season.seasonId, warDay: day, changeSequence }));
    } catch (reason) { setStatus(errorText(reason, "Unable to undo that change.")); }
  };

  const clearChecklist = async () => {
    if (!snapshot) return;
    try {
      setBaseline(await clearCwlAppliedLineupChanges(client, { clanTag, seasonId: snapshot.season.seasonId, warDay: day }));
      setPanel(null);
    } catch (reason) { setStatus(errorText(reason, "Unable to clear the checklist.")); }
  };

  /* ---- render ---- */

  if (loading && !snapshot) {
    return <main className="cm-shell" aria-busy="true">
      <AppTopbar route="cwl" eyebrow="CWL" title="Lineup" />
      <CwlPhaseStrip phase={phase} onPhase={onPhase} />
      <div className="cm-rows">{[0, 1, 2, 3, 4, 5].map((index) => <div className="cm-row is-skeleton" key={index}>
        <span className="cm-row-main"><span className="cm-skel" style={{ width: "42%" }} /><span className="cm-row-meta"><span className="cm-skel" style={{ width: 84 }} /></span></span>
        <span className="cm-row-stats"><span className="cm-skel" style={{ width: 34 }} /></span>
      </div>)}</div>
    </main>;
  }
  if (error && !snapshot) {
    return <main className="cm-shell">
      <div className="cm-notice" role="alert"><div className="cm-grow"><strong>Lineup workspace unavailable</strong><p>{error}</p></div></div>
    </main>;
  }
  if (!snapshot) return null;

  const warSize = snapshot.season.warSize;
  const warStates = new Map(snapshot.warDays.map((war) => [war.warDay, war.state]));
  const benchSize = snapshot.members.length - draft.length;
  const selected = panel?.mode === "swap" ? memberByTag.get(panel.tag) : undefined;

  const panelBody = panel?.mode === "changes"
    ? <ChecklistPanel
        todo={todo} done={done} nameOf={nameOf}
        onCheck={(item) => void checkOff(item)}
        onUndo={(sequence) => void undoCheck(sequence)}
        onClear={() => void clearChecklist()}
        onClose={() => setPanel(null)}
      />
    : selected
      ? <SwapPanel
          member={selected} candidates={candidates} search={search} locked={locked}
          onSearch={setSearch}
          onChoose={chooseCandidate}
          onAvailability={(value) => void updateAvailability(selected, value)}
          onBench={() => benchMember(selected.playerTag)}
          onClose={() => { setPanel(null); setSearch(""); }}
        />
      : panel?.mode === "bench"
        ? <BenchPanel
            candidates={candidates} benchSize={benchSize} search={search}
            onSearch={setSearch} onChoose={chooseCandidate}
            onClose={() => { setPanel(null); setSearch(""); }}
          />
        : null;

  /* Where the column has a default occupant, as the bench does, the panel keeps
   * its close control and closing returns to that default (#23). */
  const dockedBody = panelBody ?? <BenchPanel
    candidates={candidates} benchSize={benchSize} search={search}
    onSearch={setSearch} onChoose={chooseCandidate}
    onClose={() => { setPanel(null); setSearch(""); }}
  />;
  const sheetLabel = panel?.mode === "changes" ? "In game" : selected ? selected.name : "Bench";

  const quiet = todo.length === 0 && done.length === 0;

  return <>
    <main className="cm-shell cwl-workspace">
      <AppTopbar
        route="cwl"
        eyebrow={<>CWL <span className="cm-sep">·</span> {snapshot.season.seasonId}</>}
        title={`Day ${day} lineup`}
      >
        <div className="cm-topbar-side">
          <span className={`cm-statuschip ${locked ? "is-on" : ""}`}>{locked ? "Locked" : "Unlocked"}</span>
          <span className="cwl-daymenu-wrap">
            <button
              className="cm-iconbutton"
              type="button"
              aria-label="Day options"
              aria-haspopup="menu"
              aria-expanded={dayMenuOpen}
              onClick={() => setDayMenuOpen((open) => !open)}
            ><Icon name="more" /></button>
            {dayMenuOpen
              ? <div className="cwl-daymenu" role="menu">
                  <button type="button" role="menuitem" disabled={locked || day === 1} onClick={() => void reinherit()}>Re-inherit Day {day - 1}</button>
                  <button type="button" role="menuitem" onClick={() => void toggleLock()}>{locked ? "Unlock day" : "Lock day"}</button>
                </div>
              : null}
          </span>
        </div>
      </AppTopbar>

      <CwlPhaseStrip phase={phase} onPhase={onPhase} lineupDayLabel={`Day ${day}`} />

      <nav className="cm-segmented" aria-label="CWL war days">
        {DAYS.map((item) => <button key={item} type="button" aria-current={item === day} onClick={() => setDay(item)}>
          <span>Day {item}</span><small>{warDayStatus(warStates.get(item))}</small>
        </button>)}
      </nav>

      {/* One region, and both claimants are danger (#19). The revision conflict
          wins ties: stale collection makes the evidence older than you think,
          but a moved revision makes the list you are physically executing wrong. */}
      {conflict
        ? <div className="cm-notice" role="alert">
            <div className="cm-grow">
              <strong>The plan changed while you were applying it</strong>
              <p>Now at rev {snapshot.plan.revision}; your checklist was built from rev {listRevision}. The {done.length} {done.length === 1 ? "change you already made is" : "changes you already made are"} kept — what is left has been recalculated.</p>
            </div>
            <button type="button" onClick={() => { setListRevision(snapshot.plan.revision); setPanel({ mode: "changes" }); }}>Review</button>
          </div>
        : stale
          ? <div className="cm-notice" role="alert">
              <div className="cm-grow"><strong>This plan is out of date</strong><p>{status || "Another leader saved or locked this day. Reload the latest before saving."}</p></div>
              <button type="button" onClick={() => void load()}>Reload latest</button>
            </div>
          : error
            ? <div className="cm-notice" role="alert"><div className="cm-grow"><strong>Lineup workspace error</strong><p>{error}</p></div></div>
            : null}

      <div className="cm-columns cwl-columns">
        <div>
          <section className="cm-section">
            <div className="cm-section-head">
              <h2>
                {reordering ? "Match in-game order" : "Lineup"}
                <span className={`cm-count ${planned.length < warSize ? "is-short" : ""}`}>{planned.length} / {warSize}</span>
              </h2>
              <div className="cwl-headactions">
                {reordering
                  ? <button className="cwl-donebutton" type="button" onClick={() => setReordering(false)}>Done</button>
                  : <>
                      <button
                        className="cm-iconbutton is-small"
                        type="button"
                        aria-label="Reorder lineup"
                        disabled={locked}
                        onClick={() => { setReordering(true); setPanel(null); }}
                      ><Icon name="reorder" /></button>
                      {/* In the section head, not below fifteen rows: adding to a
                          short lineup must not require scrolling past it first. */}
                      <button className="cwl-benchbutton" type="button" onClick={() => { setPanel({ mode: "bench" }); setSearch(""); }}>
                        Bench {benchSize} <span aria-hidden="true"><Icon name="chevron" /></span>
                      </button>
                    </>}
              </div>
            </div>
            <div
              className={`cm-rows ${reordering ? "cwl-reordering" : ""}`}
              ref={listRef}
              onPointerDown={onListPointerDown}
              onPointerMove={onListPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              {reordering
                ? planned.map((member, index) => <ReorderRow
                    key={member.playerTag}
                    member={member}
                    index={index}
                    wasIndex={saved.indexOf(member.playerTag)}
                    moved={movedTags.has(member.playerTag)}
                  />)
                : planned.map((member, index) => <MemberRow
                    key={member.playerTag}
                    member={member}
                    position={index + 1}
                    edited={!saved.includes(member.playerTag) || movedTags.has(member.playerTag)}
                    onOpen={() => { setPanel({ mode: "swap", tag: member.playerTag }); setSearch(""); }}
                  />)}
              {planned.length === 0 ? <p className="cm-empty">No one is in this day's lineup yet.</p> : null}
            </div>
          </section>
        </div>

        <div className="cwl-bench-column">{wide ? dockedBody : null}</div>

        <aside className="cwl-rail">
          <div className="cwl-railcard">
            <h2>Bonus priority</h2>
            <ol>{[...snapshot.members].sort(sortBonusPriority).slice(0, 8).map((member, index) => <li key={member.playerTag}>
              <span className="cwl-rank">{index + 1}</span>
              <span>{member.name}</span>
              {isBonusSecured(member)
                ? <span className="cm-pill is-success">Qualified</span>
                : <span className="cm-row-th">{member.stars}<Icon name="star" /></span>}
            </li>)}</ol>
          </div>
          <div className="cwl-railcard">
            <h2>Lineup history</h2>
            <ol>{snapshot.history.slice(0, 5).map((event) => {
              const summary = historySummary(event, nameOf);
              return <li key={event.id}>
                <span />
                <span>
                  <b>{event.label}</b><br />
                  <span className="cm-row-th">{event.actorName} <span className="cm-sep">·</span> {new Date(event.occurredAt).toLocaleString()}{summary ? ` · ${summary}` : ""}</span>
                </span>
                <span />
              </li>;
            })}</ol>
          </div>
        </aside>
      </div>

      <p className="cwl-visually-hidden" role="status" aria-live="polite">{status}</p>
    </main>

    {/* Two independent controls, not one arbitrated label. The left is the
        in-game checklist (saved plan vs the game); the right is Save (draft vs
        saved plan). Different questions with different answers, and a bar that
        showed only the more urgent one would be lying about the other. */}
    <div className="cm-actionbar">
      <div className="cm-actionbar-inner">
        <button
          className={`cm-actionbar-changes ${quiet ? "is-clean" : ""}`}
          type="button"
          disabled={quiet}
          aria-expanded={panel?.mode === "changes"}
          onClick={() => setPanel((current) => current?.mode === "changes" ? null : { mode: "changes" })}
        >
          <span className="cm-actionbar-dot" />
          <span>{quiet
            ? "Nothing to make in game"
            : todo.length === 0
              ? `All ${done.length} made in game`
              : `${todo.length} to make in game${done.length ? ` · ${done.length} done` : ""}`}</span>
          <span className="cm-actionbar-caret">{quiet ? null : <Icon name="chevron" />}</span>
        </button>
        <button className="cm-actionbar-save" type="button" disabled={unsaved === 0 || locked} onClick={() => void save()}>
          {unsaved === 0 ? "Saved" : `Save ${unsaved}`}
        </button>
      </div>
    </div>

    {!wide && panelBody
      ? <Sheet label={sheetLabel} onClose={() => { setPanel(null); setSearch(""); }}>{panelBody}</Sheet>
      : null}
  </>;
}
