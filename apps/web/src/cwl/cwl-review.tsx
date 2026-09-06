/* The post-CWL review phase (#54, #25 wave 3).
 *
 * Spec: design/prototype/cwl-review.html. It is the second phase of the CWL
 * route rather than a fourth tab (ADR 0002): review is impossible during a
 * season and the workspace is inert after one, so the phase control above the
 * list is the same `cm-segmented` the day strip uses, one level up.
 *
 * THREE DECISIONS, ONE LIST. Bonus medals, role changes and follow-ups share a
 * roster and a season, and ADR 0023's ranking serves all three from opposite
 * ends: the top of the list is who contributed most, the foot is who did not
 * turn up. A second section for follow-ups would put the same rows on the page
 * twice, which is what `#/overview` was deleted for.
 *
 * The two groups are ADR 0023's eight-star boundary made visible. They are NOT
 * a bonus cutoff: the game grants a league-dependent number of bonuses and
 * nothing in the schema knows it — checked against stored `raw_snapshots` on
 * #54, neither CWL payload carries any bonus, medal or reward field. The list
 * ranks; the leader supplies the count.
 *
 * IT RECORDS EXACTLY ONE FACT: whether the bonus medals have been handed out.
 * Not who received them. One fact does not make an editing surface — there is
 * no action bar and no draft, because a bar exists to hold "unsaved" against
 * "not yet done in game" (#21) and neither question exists here. The state is a
 * chip in the topbar and one item in the season menu, which is exactly how the
 * lineup carries the day lock: a status is read in the header, an action is
 * taken from the menu that owns the scope.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppTopbar } from "../app-chrome.js";
import { Icon } from "../design/icon.js";
import { Metric, SkeletonRows, SKELETON_DELAY_MS, useWide } from "../design/layout.js";
import { Sheet } from "../design/sheet.js";
import {
  isCollectionUnhealthy,
  loadCwlReviewSeason,
  setCwlBonusesAdministered,
  type CwlMemberRole,
  type CwlReviewMember,
  type CwlReviewSeasonSnapshot,
} from "../data/operations.js";
import { seasonName } from "./cwl-countdown.js";
import { CwlPhaseStrip } from "./cwl-phase-strip.js";
import { CwlRatingBreakdown } from "./cwl-rating.js";
import type { CwlPhase } from "./cwl-phase.js";
import "./cwl-review.css";

/* ADR 0023's threshold, shared with the lineup workspace's own bonus predicate.
 * It is a rank boundary here rather than a cutoff — see the header. */
export const CWL_BONUS_STAR_THRESHOLD = 8;

/* ---------------------------------------------------------------------------
 * Derivations
 * ------------------------------------------------------------------------- */

export interface CwlSeasonRecord {
  stars: number;
  assignedAttacks: number;
  completedAttacks: number;
  missedAttacks: number;
  warsParticipated: number;
  starsPerWar: number | null;
  secured: boolean;
}

/* Derived over the LOGGED days only, which is what the loader hands back. A war
 * day that never reached `warEnded` contributes no stars and no missed attack,
 * because it is absent from the assignment record entirely — that is coverage
 * rather than a clean sheet, and the eyebrow and the panel both say so. */
export function seasonRecord(member: CwlReviewMember): CwlSeasonRecord {
  const played = member.days.filter((day) => day.inLineup);
  const stars = played.reduce((sum, day) => sum + day.stars, 0);
  const assignedAttacks = played.reduce((sum, day) => sum + day.assignedAttacks, 0);
  const completedAttacks = played.reduce((sum, day) => sum + day.completedAttacks, 0);
  return {
    stars,
    assignedAttacks,
    completedAttacks,
    missedAttacks: Math.max(0, assignedAttacks - completedAttacks),
    warsParticipated: played.length,
    starsPerWar: played.length ? stars / played.length : null,
    secured: stars >= CWL_BONUS_STAR_THRESHOLD,
  };
}

const ROLE_RANK: Record<CwlMemberRole, number> = { leader: 0, coLeader: 1, elder: 2, member: 3, unknown: 4 };

export interface RankedReviewMember { member: CwlReviewMember; record: CwlSeasonRecord; rank: number }

/* ADR 0023's order and nothing else: eight or more stars first, then total
 * stars, with stars per war and wars participated as the supporting context —
 * which is what the tie-breaks are. Elder is the last resort, as CONTEXT.md has
 * it. CWL RATING NEVER SORTS THIS LIST: it is not a lineup, and rating floats
 * the already-secured members to the top, which is backwards for a page whose
 * foot is the follow-up conversation. */
export function rankReviewMembers(members: readonly CwlReviewMember[]): RankedReviewMember[] {
  return members
    .map((member) => ({ member, record: seasonRecord(member) }))
    .sort((left, right) =>
      (Number(right.record.secured) - Number(left.record.secured))
      || (right.record.stars - left.record.stars)
      || ((right.record.starsPerWar ?? 0) - (left.record.starsPerWar ?? 0))
      || (right.record.warsParticipated - left.record.warsParticipated)
      || (ROLE_RANK[left.member.role] - ROLE_RANK[right.member.role])
      || left.member.name.localeCompare(right.member.name))
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

function roleLabel(value: CwlMemberRole): string {
  return value === "coLeader" ? "Co-leader"
    : value === "elder" ? "Elder"
    : value === "leader" ? "Leader"
    : value === "member" ? "Member"
    : "Unknown";
}

function countLabel(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/* ---------------------------------------------------------------------------
 * Rows
 * ------------------------------------------------------------------------- */

/* Rows mark the exception. Stars and wars joined sit in the stats slot on every
 * row because they are the ranking's own terms and a rank you cannot read is a
 * verdict — three stars from one war and three from seven are different facts.
 *
 * ATTACKS USED IS NOT ON THE ROW, and that is the row-marking rule doing real
 * work: an unmarked row used every attack it was given, so printing "7 of 7"
 * beside it says the same thing twice. It earns its place only where the
 * container query has already bought the space.
 *
 * An unlogged war day is not a row mark either, from the other direction: a war
 * day that never ended is missing for all fifteen members who were in it, so
 * marking the row fires on most of the roster and distinguishes nobody. It
 * belongs to the season — the eyebrow states it — and to the panel, where it
 * explains one member's figures. Scope the mark to the thing that varies. */
function ReviewRow({ entry, selected, onOpen }: {
  entry: RankedReviewMember;
  selected: boolean;
  onOpen: () => void;
}) {
  const { member, record, rank } = entry;
  const marks = [
    <span key="role">{roleLabel(member.role)}</span>,
    record.missedAttacks > 0
      ? <span key="missed" className="cm-statustext is-unavailable">{countLabel(record.missedAttacks, "attack")} missed</span>
      : null,
    record.warsParticipated === 0
      ? <span key="none" className="cm-statustext is-unknown">In no logged war</span>
      : null,
  ].filter(Boolean);
  /* Separators are siblings of the marks, not wrappers around them. `cm-row-meta`
     is a flex row with a gap, so wrapping a separator and its mark in one element
     makes them a single flex item and the gap disappears on one side. */
  const meta = marks.flatMap((mark, index) => index === 0
    ? [mark]
    : [<span key={`sep-${index}`} className="cm-sep">·</span>, mark]);
  return (
    <button
      className={`cm-row has-pos ${selected ? "is-selected" : ""}`}
      type="button"
      onClick={onOpen}
    >
      <span className="cm-row-pos">{rank}</span>
      <span className="cm-row-main">
        <span className="cm-row-name">{member.name}</span>
        <span className="cm-row-meta">{meta}</span>
      </span>
      <span className="cm-row-stats cwl-review-wide-only">
        <span className="cm-row-th cwl-review-stat">{record.completedAttacks} of {record.assignedAttacks}</span>
        <span className="cm-row-th cwl-review-stat">{record.starsPerWar === null ? "—" : record.starsPerWar.toFixed(1)}</span>
      </span>
      <span className="cm-row-stats">
        <span className="cm-row-figure">{record.stars}<Icon name="star" /></span>
        <span className="cm-row-th">{countLabel(record.warsParticipated, "war")}</span>
      </span>
      <span className="cm-chev" aria-hidden="true"><Icon name="chevron" /></span>
    </button>
  );
}

function ListHead() {
  return <div className="cwl-review-listhead" aria-hidden="true">
    <span>#</span><span>Member</span>
    <span className="cwl-review-group"><span>Attacks</span><span>Stars / war</span></span>
    <span className="cwl-review-stars">Stars · wars</span><span />
  </div>;
}

/* ---------------------------------------------------------------------------
 * Panel
 * ------------------------------------------------------------------------- */

function DayOutcome({ inLineup, completed }: { inLineup: boolean; completed: number }) {
  /* Words, not glyphs. A tick and a cross here would be two new icons for a data
     column, and #40's rule is that an affordance becomes an icon while
     everything else stays type — a war day's outcome is not something you
     press. */
  if (!inLineup) return <span className="cwl-review-outcome cm-statustext is-unknown">Not in the lineup</span>;
  if (completed > 0) return <span className="cwl-review-outcome">Attacked</span>;
  return <span className="cwl-review-outcome cm-statustext is-unavailable">Missed</span>;
}

function MemberPanel({ entry, loggedWarDays, seasonId, wide, onClose }: {
  entry: RankedReviewMember;
  loggedWarDays: number;
  seasonId: string;
  wide: boolean;
  onClose: () => void;
}) {
  const { member, record } = entry;
  return (
    <div className="cm-panel" {...(wide ? {} : { role: "dialog", "aria-modal": true })} aria-label={member.name}>
      <div className="cm-panel-head">
        <div className="cm-grow">
          <h2>{member.name}</h2>
          <p className="cm-panel-evidence">
            {roleLabel(member.role)} <span className="cm-sep">·</span> TH{member.townHallLevel} <span className="cm-sep">·</span>{" "}
            joined {record.warsParticipated} of {countLabel(loggedWarDays, "war")}
            {/* A LINE BREAK, not another separator. The rating sits where the
                lineup workspace puts it -- on the lede's own second line -- and
                a `·` here let it wrap to wherever the identity line happened to
                end, which on a phone is a different place for every member. */}
            <br />
            {member.rating.overallRating === null
              ? "No rating yet"
              : <><b>{Math.round(member.rating.overallRating)}</b> rating</>}
          </p>
        </div>
        {wide ? null : <button className="cm-iconbutton" type="button" aria-label="Close" onClick={onClose}><Icon name="close" /></button>}
      </div>
      <div className="cm-panel-body">
        {/* Scoped, like every other label in this panel: "Season record" alone
            is ambiguous once the season menu can move you between seasons. */}
        <p className="cm-panel-label">Season record <span className="cm-sep">·</span> CWL {seasonName(seasonId)}</p>
        <dl className="cwl-review-facts">
          <div><dt>Stars</dt><dd>{record.stars}</dd></div>
          <div><dt>Stars per war</dt><dd>{record.starsPerWar === null ? "—" : record.starsPerWar.toFixed(1)}</dd></div>
          <div><dt>Attacks used</dt><dd>{record.completedAttacks} of {record.assignedAttacks}</dd></div>
          <div><dt>Missed</dt><dd>{record.missedAttacks}</dd></div>
        </dl>
        {member.unloggedWarDays > 0
          ? <p className="cwl-review-caveat">{countLabel(member.unloggedWarDays, "war day")} this member was in{" "}
              {member.unloggedWarDays === 1 ? "has" : "have"} not been recorded as ended, so{" "}
              {member.unloggedWarDays === 1 ? "it is" : "they are"} absent from this record entirely — neither stars nor a missed attack.</p>
          : null}

        <p className="cm-panel-label">War days</p>
        {member.days.length
          ? <ul className="cwl-review-days">
              {member.days.map((day) => <li key={day.warDay}>
                <span className="cwl-review-day">Day {day.warDay}</span>
                <DayOutcome inLineup={day.inLineup} completed={day.completedAttacks} />
                <span className="cwl-review-figure">
                  {day.inLineup && day.completedAttacks > 0 ? <>{day.stars}<Icon name="star" /></> : "—"}
                </span>
              </li>)}
            </ul>
          : <p className="cwl-review-freshness">No war day in this season has been recorded as ended yet.</p>}

        {/* One rating from one view, replacing this panel's own thirty-day
            gauge. That gauge was anchored to `now()`, so on a previous season's
            review it reported the last thirty days beside a months-old season
            -- and it showed the same evidence the rating is now made of, under
            a second definition (#89). */}
        <CwlRatingBreakdown rating={member.rating} />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * The page
 * ------------------------------------------------------------------------- */

export function CwlReviewPage({ client, clanTag, seasonId, phase, onPhase, onSeason, lineupDayLabel }: {
  client: any;
  clanTag: string;
  /* The season the leader picked from the menu, or undefined for the current
     one (#56). Undefined rather than the resolved id, because which season is
     current is the loader's answer and this surface should not hold a second
     opinion about it. */
  seasonId?: string | undefined;
  phase: CwlPhase;
  onPhase: (next: CwlPhase) => void;
  onSeason: (seasonId: string) => void;
  lineupDayLabel: string;
}) {
  const wide = useWide();
  const [snapshot, setSnapshot] = useState<CwlReviewSeasonSnapshot>();
  const [error, setError] = useState<string>();
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [seasonMenuOpen, setSeasonMenuOpen] = useState(false);
  const [status, setStatus] = useState("");

  const load = useCallback(async () => {
    setError(undefined);
    try {
      /* One load where there were two. The second fetched a `now()`-anchored
         thirty-day gauge; the rating it duplicated is now part of the season
         snapshot, scoped to the same season the rest of this surface shows. */
      setSnapshot(await loadCwlReviewSeason(client, clanTag, seasonId));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load the CWL season record.");
    }
  }, [clanTag, client, seasonId]);

  useEffect(() => {
    const timer = setTimeout(() => setShowSkeleton(true), SKELETON_DELAY_MS);
    void load().finally(() => clearTimeout(timer));
    return () => clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setSeasonMenuOpen(false);
      setSelectedTag(null);
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, []);

  const ranked = useMemo(() => rankReviewMembers(snapshot?.members ?? []), [snapshot]);

  const administered = snapshot?.season.bonusesAdministeredAt != null;
  const toggleAdministered = async () => {
    if (!snapshot) return;
    setSeasonMenuOpen(false);
    try {
      const next = await setCwlBonusesAdministered(client, {
        clanTag, seasonId: snapshot.season.seasonId, administered: !administered,
      });
      setSnapshot((current) => current
        ? { ...current, season: { ...current.season, bonusesAdministeredAt: next.bonusesAdministeredAt } }
        : current);
      setStatus(next.bonusesAdministeredAt ? "Bonus medals recorded as handed out." : "Review reopened.");
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : "Unable to record whether the bonuses were handed out.");
    }
  };

  const coverage = snapshot && snapshot.loggedWarDays < snapshot.totalWarDays
    ? ` · ${snapshot.loggedWarDays} of ${snapshot.totalWarDays} war days logged`
    : "";
  /* A previous season says so in the eyebrow (#56). The season id is a month
     and a leader reading `2026-07` in July has no way to tell a finished record
     from a live one, so the surface states which it is rather than leaving the
     season menu as the only place that knows. */
  const previous = snapshot !== undefined
    && snapshot.seasonIds[0] !== undefined
    && snapshot.seasonIds[0] !== snapshot.season.seasonId;
  const eyebrow = `CWL${snapshot ? ` · ${seasonName(snapshot.season.seasonId)}` : ""}${previous ? " · Previous season" : ""}${coverage}`;

  /* Where the panel is docked it opens on the top-ranked member — an empty
     column is dead space that also hides the fact that rows do anything. The
     narrow layout never auto-opens, because there the panel covers the list. */
  const activeTag = selectedTag ?? (wide ? ranked[0]?.member.playerTag ?? null : null);
  const active = activeTag ? ranked.find((entry) => entry.member.playerTag === activeTag) : undefined;
  const panelBody = active
    ? <MemberPanel
        entry={active}
        loggedWarDays={snapshot?.loggedWarDays ?? 0}
        seasonId={snapshot?.season.seasonId ?? ""}
        wide={wide}
        onClose={() => setSelectedTag(null)}
      />
    : null;

  const secured = ranked.filter((entry) => entry.record.secured);
  const below = ranked.filter((entry) => !entry.record.secured);
  const missedAttacks = ranked.reduce((sum, entry) => sum + entry.record.missedAttacks, 0);
  const clanStars = ranked.reduce((sum, entry) => sum + entry.record.stars, 0);
  /* The same predicate the Admin route reads, not a second copy of the rule:
     "which statuses count as unhealthy" is one fact and two surfaces ask it. */
  const stale = snapshot !== undefined && isCollectionUnhealthy({
    status: snapshot.freshness.collectionStatus,
    attempts: snapshot.freshness.collectionAttempts,
  });

  return <>
    <main className="cm-shell cwl-review-page" aria-busy={!snapshot && !error}>
      <AppTopbar route="cwl" eyebrow={eyebrow} title="Review">
        <div className="cm-topbar-side">
          {/* The chip appears only once the medals are out, which is the
              row-marking rule at page scale: "still to do" is the state this
              surface exists in, so it goes unmarked. */}
          {administered ? <span className="cm-statuschip is-on">Bonuses administered</span> : null}
          <span className="cwl-seasonmenu-wrap">
            <button
              className="cm-iconbutton"
              type="button"
              aria-label="Season options"
              aria-haspopup="menu"
              aria-expanded={seasonMenuOpen}
              disabled={!snapshot}
              onClick={() => setSeasonMenuOpen((open) => !open)}
            ><Icon name="more" /></button>
            {seasonMenuOpen && snapshot
              ? <div className="cwl-seasonmenu" role="menu">
                  <button type="button" role="menuitem" onClick={() => void toggleAdministered()}>
                    {administered ? "Reopen review" : "Mark bonuses administered"}
                  </button>
                  <div className="cwl-seasonmenu-divider" />
                  {/* Every collected season, newest first, and the whole list
                      is live since #56. The entry for the season on screen is
                      `aria-current` and closes the menu rather than routing to
                      where you already are. */}
                  {snapshot.seasonIds.map((entry, index) => entry === snapshot.season.seasonId
                    ? <button key={entry} type="button" role="menuitem" aria-current="true" onClick={() => setSeasonMenuOpen(false)}>
                        {seasonName(entry)} {index === 0 ? <small>Current</small> : null}
                      </button>
                    : <button key={entry} type="button" role="menuitem" onClick={() => { setSeasonMenuOpen(false); onSeason(entry); }}>
                        {seasonName(entry)} {index === 0 ? <small>Current</small> : null}
                      </button>)}
                </div>
              : null}
          </span>
        </div>
      </AppTopbar>

      <CwlPhaseStrip phase={phase} onPhase={onPhase} lineupDayLabel={lineupDayLabel} />

      <div className="cm-summary">
        <Metric value={snapshot ? ranked.length : null} label="Members in the season" />
        <Metric value={snapshot ? clanStars : null} label="Clan stars" />
        <Metric value={snapshot ? secured.length : null} label="At eight or more stars" />
        <Metric value={snapshot ? missedAttacks : null} label="Missed attacks" danger={missedAttacks > 0} />
      </div>

      {/* One region, danger only (#19). A stale collection makes every figure on
          this page older than the heading claims, which is the one thing here
          that can be wrong rather than merely thin. */}
      {error
        ? <div className="cm-notice" role="alert">
            <div className="cm-grow"><strong>Season record unavailable</strong><p>{error}</p></div>
            <button type="button" onClick={() => void load()}>Retry</button>
          </div>
        : stale
          ? <div className="cm-notice" role="alert">
              <div className="cm-grow">
                {/* A NULL STATUS IS NOT A STATUS. It means no run row could be
                    read at all, and interpolating it produced "reported ." —
                    a sentence whose missing word was the only evidence it
                    claimed to carry (#74). The two cases are different facts
                    and read as different sentences. */}
                <strong>Collection data is stale</strong>
                {snapshot?.freshness.collectionStatus
                  ? <p>The last collection run reported {snapshot.freshness.collectionStatus}. Attacks made since then are not in this record.</p>
                  : <p>No collection run has been recorded, so nothing here can be shown to be current.</p>}
              </div>
              <button type="button" onClick={() => void load()}>Retry</button>
            </div>
          : null}

      <div className="cm-columns">
        <div>
          {snapshot
            ? <>
                <Group title="Eight or more stars" entries={secured} selectedTag={activeTag} onOpen={setSelectedTag} />
                <Group title="Below eight stars" entries={below} selectedTag={activeTag} onOpen={setSelectedTag} />
                {ranked.length === 0 ? <p className="cm-empty">No members are signed up for this CWL season.</p> : null}
              </>
            : showSkeleton && !error ? <SkeletonRows /> : null}
        </div>
        <div>{wide ? panelBody : null}</div>
      </div>

      <p className="cwl-review-live" role="status" aria-live="polite">{status}</p>
    </main>
    {!wide && panelBody && selectedTag
      ? <Sheet label={active?.member.name ?? ""} onClose={() => setSelectedTag(null)}>{panelBody}</Sheet>
      : null}
  </>;
}

/* Two groups, one continuous ranking — the numbers do not restart. The boundary
 * is ADR 0023's eight-star threshold and says so in its own heading. */
function Group({ title, entries, selectedTag, onOpen }: {
  title: string;
  entries: RankedReviewMember[];
  selectedTag: string | null;
  onOpen: (tag: string) => void;
}) {
  if (entries.length === 0) return null;
  return <section className="cm-section cwl-review-section">
    <div className="cm-section-head">
      <h2>{title} <span className="cm-count">{entries.length}</span></h2>
    </div>
    <ListHead />
    <div className="cm-rows">
      {entries.map((entry) => <ReviewRow
        key={entry.member.playerTag}
        entry={entry}
        selected={entry.member.playerTag === selectedTag}
        onOpen={() => onOpen(entry.member.playerTag)}
      />)}
    </div>
  </section>;
}

