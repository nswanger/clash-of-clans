/* The CWL stand-down phase (#55, #25 wave 4).
 *
 * Spec: design/prototype/cwl-resting.html. The third phase of the CWL route
 * (ADR 0002): lineup and review are exactly complementary in time, and this is
 * the position where neither has anything to say. It is where bare `#/cwl` lands
 * once the bonuses are administered.
 *
 * IT IS A COUNTDOWN, NOT A NOTICE, and that is a reading of ADR 0002's
 * constraint rather than an exception to it. The ADR requires this surface to
 * read as absence rather than reassurance, and #19 bans the happy-path banner.
 * Both are aimed at a page telling you everything is fine. A countdown makes a
 * different claim — that something is coming — and it is a true one: CWL
 * restarts on the 1st of every month whether or not this app exists. So the
 * page's largest object is the thing arriving, and the season that finished is
 * muted and small.
 *
 * THE BODY IS ONE PAGE-LAYER COMPONENT AND IS NOT PROMOTED. #55 asked whether a
 * page-scale resting state is simply `cm-empty` at a larger size; it is not, and
 * the reason is not scale. Every live `cm-empty` is a slot filler inside a panel
 * that already supplies a heading and a frame, standing in for a list. There is
 * no list here — the body IS the state. It is not a `cm-panel` either: that is
 * `position: fixed; bottom: 0`, the overlay sheet, and the first draft rendered
 * pinned to the bottom of the viewport. See cwl-rest.css.
 *
 * IT SELF-CLEARS. Once the new season is collected it becomes the current season
 * with no war states, and `defaultCwlPhase` already returns lineup for exactly
 * that case. Nothing here has to detect the season starting.
 *
 * #96 GAVE IT THE ONE THING THERE IS TO DO HERE. The clan's availability process
 * runs before CWL starts -- a message to clan chat in the last days of the
 * month, and whoever likes it is available for the season about to begin -- and
 * none of the CWL tables can hold that answer, because the season it is about
 * does not exist yet. So the roll call is recorded here, against a month, and
 * seeds `member_availability` once the real season lands.
 *
 * A body does not break the paragraph above it. That rule bans REASSURANCE, and
 * this page was already allowed to make the different claim that something is
 * coming; somewhere to put the answer to the thing arriving is the same claim
 * with a use. The roll call is stacked BENEATH the countdown rather than beside
 * it, so the clock is still the largest object and the finished season still the
 * smallest -- two column layouts were built first, and whichever surface took
 * the main column read as what the page was about.
 */
import { useEffect, useState } from "react";
import { AppTopbar } from "../app-chrome.js";
import { Icon } from "../design/icon.js";
import { Mark } from "../design/mark.js";
import { LIST_MAX_ROWS, useWide } from "../design/layout.js";
import { Sheet } from "../design/sheet.js";
import {
  loadRollCall,
  setCwlBonusesAdministered,
  setRollCallEntry,
  type CwlSeasonPhaseSnapshot,
  type RollCallMember,
  type RollCallSnapshot,
} from "../data/operations.js";
import { clockText, coarseText, nextCwlStart, remainingUntilNextCwl, rollCallTargetMonth, seasonName, targetText } from "./cwl-countdown.js";
import { CwlPhaseStrip } from "./cwl-phase-strip.js";
import type { CwlPhase } from "./cwl-phase.js";
import "./cwl-rest.css";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => window.matchMedia?.(REDUCED_MOTION_QUERY).matches ?? false);
  useEffect(() => {
    const query = window.matchMedia?.(REDUCED_MOTION_QUERY);
    if (!query) return;
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);
  return reduced;
}

/* The clock, and the two things that stop it.
 *
 * A ticking number is not animation in the strict sense, but it is the same
 * instinct, so under `prefers-reduced-motion` there is no interval at all and
 * the surface renders a coarse static string instead.
 *
 * And it pauses while the tab is hidden. This page's entire premise is being
 * left open for days, which makes a timer that runs regardless the one real cost
 * of the drop form — and an avoidable one. */
export function useCwlCountdown(): { remainingMs: number; reduced: boolean } {
  const reduced = usePrefersReducedMotion();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (reduced) return;
    let timer: number | undefined;
    const tick = () => setNow(Date.now());
    const stop = () => { if (timer !== undefined) window.clearInterval(timer); timer = undefined; };
    const start = () => { stop(); timer = window.setInterval(tick, 1000); };
    /* Re-reading the clock on the way back matters more than the interval does:
       a tab hidden for two days returns to a countdown two days stale. */
    const onVisibility = () => { if (document.hidden) stop(); else { tick(); start(); } };
    document.addEventListener("visibilitychange", onVisibility);
    if (!document.hidden) start();
    return () => { stop(); document.removeEventListener("visibilitychange", onVisibility); };
  }, [reduced]);

  return { remainingMs: remainingUntilNextCwl(new Date(now)), reduced };
}


/* THE ROLL CALL PANEL (#96).
 *
 * `cm-panel`, and that was settled by the inventory rather than chosen here:
 * components.md lists a modal dialog under what is deliberately not a component
 * -- "The panel covers every case both surfaces had. A second overlay form would
 * need a reason neither has produced." This is not that reason.
 *
 * BOTH MOUNTINGS, LIKE EVERY OTHER PANEL: a sheet below 720px, DOCKED into a
 * column above it. The first draft forced the sheet at every width because this
 * surface had no column to dock into; the answer was to give it one, not to
 * override the system. Desktop is where the roll call is actually done -- the
 * game is on a phone and the ticking happens on a computer -- so on the width
 * that matters most it is not a popup at all.
 *
 * DOCKED IT HAS NO CLOSE CONTROL AND IS ALWAYS OPEN. components.md: "Where a
 * docked panel has no other occupant it opens on the first row by default and
 * carries no close control -- there is nowhere to dismiss it to." This column has
 * no other occupant, so the close button and the trigger button below the clock
 * are both narrow-viewport controls.
 *
 * The rows are `cm-check`, the app's existing 44px tick row, and the reuse is
 * exact rather than approximate: both lists are a leader working down a roster
 * ticking people off, and `is-done` filling the box with success ink reads as
 * "this one is in" in both places. Only the middle slot differs, which is what
 * that slot is for.
 *
 * THE LIST IS THE CLAN, NOT THE CWL GROUP. `cwl_members` is the signup roster
 * and does not exist yet -- that is the whole reason this surface is here -- so
 * the roster comes from the most recent daily pull. */
function RollCallPanel({ rollCall, search, docked, onSearch, onToggle, onClose }: {
  rollCall: RollCallSnapshot;
  search: string;
  docked: boolean;
  onSearch: (value: string) => void;
  onToggle: (playerTag: string, saidYes: boolean) => void;
  onClose: () => void;
}) {
  const matched = rankRollCall(rollCall.members, search);
  /* `LIST_MAX_ROWS` (ADR 0024), not a number chosen for this surface. The box is
     always that many rows tall, so it holds still whether the query matches one
     name or thirty, and a month where more people answer than fit is read the
     same way as any other long list here: narrow it. */
  const shown = matched.slice(0, LIST_MAX_ROWS);
  return <div className="cm-panel" role={docked ? undefined : "dialog"} aria-modal={docked ? undefined : true} aria-label="Roll call">
    <div className="cm-panel-head">
      <div className="cm-grow">
        <h2>Roll call</h2>
        {/* Names the month rather than "next", because the control that reaches
            this said a month and a panel that renamed it would read as a
            different list. */}
        <p className="cm-panel-evidence">
          {seasonName(rollCall.targetMonth)} <span className="cm-sep">·</span>{" "}
          <b>{rollCall.saidYesCount}</b> of {rollCall.members.length} said yes
          {/* What is on screen, when that is not the tally to its left. The
              bench states the same thing the same way -- "2 of 2 shown" -- and
              without it a filtered list looks like the whole answer. */}
          {/* What is on screen. ALWAYS RENDERED once there is a list at all, and
              always in the same `N of M shown` shape even when the two are
              equal: a clause that appears and disappears rewraps the line, which
              moves the search field under the fingers of whoever is typing into
              it. The bench states the same thing the same way. */}
          {matched.length || search
            ? <> <span className="cm-sep">·</span> {shown.length} of {matched.length} shown</>
            : null}
        </p>
      </div>
      {docked ? null : <button className="cm-iconbutton" type="button" data-close aria-label="Close" onClick={onClose}><Icon name="close" /></button>}
    </div>
    <div className="cm-panel-body">
      {/* `cm-search` unchanged from the bench, over the same kind of list, and
          it is the ONLY way to reach a member who has not answered -- see
          `rankRollCall`. */}
      <input
        className="cm-search"
        type="search"
        placeholder="Find a member"
        aria-label="Find a member"
        value={search}
        onChange={(event) => onSearch(event.target.value)}
      />
      <div className="cwl-rest-rollcall-list">
        {shown.length
          ? shown.map((member) => <button
              key={member.playerTag}
              className={`cm-check ${member.saidYes ? "is-done" : ""}`}
              type="button"
              aria-pressed={member.saidYes}
              onClick={() => onToggle(member.playerTag, !member.saidYes)}
            >
              <span className="cm-check-box" aria-hidden="true"><Icon name="check" /></span>
              <span className="cwl-rest-rollcall-name">{member.name}</span>
              <span className="cm-row-th">TH{member.townHallLevel}</span>
            </button>)
          : search
            ? <p className="cm-empty">No one matches “{search}”.</p>
            /* `cm-empty` is the slot filler standing in for a list, which is
               exactly what this is -- and it has to say what the empty means,
               because an empty roll call and an empty search look identical. */
            : <p className="cm-empty">No answers yet. Search to add whoever liked the message.</p>}
      </div>
    </div>
  </div>;
}

/* THE LIST IS THE ANSWERS, NOT THE ROSTER -- and the search is how the rest of
 * the clan is reached. This is the bench's shape, not a new one: the lineup
 * shows the fifteen who are in and puts the other thirty-five behind
 * `cm-search`, because "ranking does the work sorting used to" (#20). Fifty rows
 * rendered by default is a roster dump that grows with the clan and is mostly
 * people who did not answer.
 *
 * So with no query this returns the ticked members alphabetically, which is
 * usually the fifteen to twenty-five who liked the message. Typing reaches
 * everyone, ticked first so an already-answered name is not offered again as if
 * it were new.
 *
 * The first roll call of a month therefore starts empty, and that is honest
 * rather than unhelpful: nobody has answered yet. It also matches the work --
 * the likes are being read off a phone one name at a time, which is a search and
 * not a scan. */
export function rankRollCall(members: readonly RollCallMember[], search: string): RollCallMember[] {
  const query = search.trim().toLowerCase();
  if (!query) return members.filter((member) => member.saidYes).sort((left, right) => left.name.localeCompare(right.name));
  return members
    .filter((member) => member.name.toLowerCase().includes(query) || member.playerTag.toLowerCase().includes(query))
    .sort((left, right) => (Number(right.saidYes) - Number(left.saidYes)) || left.name.localeCompare(right.name));
}

export function CwlStandDownPage({ client, clanTag, snapshot, phase, onPhase, onSeason, lineupDayLabel }: {
  client: any;
  clanTag: string;
  /* The phase snapshot the route already loaded, rather than a load of its own.
     This surface renders one date and one clock; the season it names and the
     menu's earlier seasons are both in the snapshot that chose the phase. */
  snapshot: CwlSeasonPhaseSnapshot;
  phase: CwlPhase;
  onPhase: (next: CwlPhase) => void;
  onSeason: (seasonId: string) => void;
  lineupDayLabel: string;
}) {
  const { remainingMs, reduced } = useCwlCountdown();
  const [seasonMenuOpen, setSeasonMenuOpen] = useState(false);
  const [status, setStatus] = useState("");
  /* Fixed for the life of the mount rather than recomputed beside the clock.
     The clock re-renders every second, and a month that could change under a
     tick is a month that could change between the button's label and the write
     it triggers. */
  const [targetMonth] = useState(() => rollCallTargetMonth(new Date()));
  const [rollCall, setRollCall] = useState<RollCallSnapshot>();
  const [rollCallOpen, setRollCallOpen] = useState(false);
  const [search, setSearch] = useState("");
  /* The same hook every other surface with a panel asks, and the same answer:
     docked above 720px, a sheet below it. */
  const wide = useWide();

  /* Loaded on mount rather than when the panel opens, because the count under
     the button is the answer to "have I already done this" -- which is the
     question a leader arrives on this page with, and the one the button alone
     cannot answer. Two small reads; a failure is silent and leaves the control
     unlabelled rather than putting an error on the quietest page in the app. */
  useEffect(() => {
    let live = true;
    void loadRollCall(client, clanTag, targetMonth)
      .then((next) => { if (live) setRollCall(next); })
      .catch(() => undefined);
    return () => { live = false; };
  }, [client, clanTag, targetMonth]);

  /* Optimistic, and it can be: a tick is one row in a table with no foreign key
     and no derived state hanging off it. A failure puts the row back and says
     so, which is the whole recovery. */
  const toggleRollCall = async (playerTag: string, saidYes: boolean) => {
    const previous = rollCall;
    setRollCall((current) => current ? withRollCallEntry(current, playerTag, saidYes) : current);
    try {
      await setRollCallEntry(client, { clanTag, targetMonth, playerTag, saidYes });
    } catch (reason) {
      setRollCall(previous);
      setStatus(reason instanceof Error ? reason.message : "Unable to save the roll call.");
    }
  };

  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setSeasonMenuOpen(false); };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, []);

  /* Reopening the review clears the administered marker, which is marker 1 of
     the phase ladder — so the way back is the mutation plus a phase the URL
     names, not a re-derivation of the default. */
  const reopenReview = async () => {
    setSeasonMenuOpen(false);
    try {
      await setCwlBonusesAdministered(client, { clanTag, seasonId: snapshot.seasonId, administered: false });
      onPhase("review");
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : "Unable to reopen the review.");
    }
  };

  const past = remainingMs <= 0;

  const page = (
    <main className="cm-shell cwl-rest-page">
      <AppTopbar route="cwl" eyebrow={`CWL · ${seasonName(snapshot.seasonId)}`} title="Stand down">
        <div className="cm-topbar-side">
          <span className="cwl-seasonmenu-wrap">
            <button
              className="cm-iconbutton"
              type="button"
              aria-label="Season options"
              aria-haspopup="menu"
              aria-expanded={seasonMenuOpen}
              onClick={() => setSeasonMenuOpen((open) => !open)}
            ><Icon name="more" /></button>
            {seasonMenuOpen
              ? <div className="cwl-seasonmenu" role="menu">
                  <button type="button" role="menuitem" onClick={() => void reopenReview()}>Reopen review</button>
                  <div className="cwl-seasonmenu-divider" />
                  {/* Off-season is when a leader is most likely to look back,
                      which made this surface #56's second consumer. The entries
                      were disabled until #56 removed the latest-season scoping;
                      each one now opens that season's review. */}
                  {snapshot.seasonIds.map((seasonId, index) => seasonId === snapshot.seasonId
                    ? <button key={seasonId} type="button" role="menuitem" aria-current="true" onClick={() => setSeasonMenuOpen(false)}>
                        {seasonName(seasonId)} {index === 0 ? <small>Current</small> : null}
                      </button>
                    : <button key={seasonId} type="button" role="menuitem" onClick={() => { setSeasonMenuOpen(false); onSeason(seasonId); }}>
                        {seasonName(seasonId)} {index === 0 ? <small>Current</small> : null}
                      </button>)}
                </div>
              : null}
          </span>
        </div>
      </AppTopbar>

      <CwlPhaseStrip phase={phase} onPhase={onPhase} lineupDayLabel={lineupDayLabel} />

      {/* `cm-columns` above 720px, exactly as the lineup and members surfaces use
          it: the surface's own content on the left, the docked panel on the
          right. Below 720px it is one column and the panel is a sheet, which is
          the component's other mounting rather than a second layout. */}
      <div className="cwl-rest">
        {/* #24's third permission, finally spent: identity is allowed in the top
            bar, the favicon and muted empty states, and until this surface
            existed the third had never fired. The cabossed head rather than the
            shield — the container is the small-size variant — muted to the
            hairline so it reads as watermark rather than illustration. */}
        <Mark variant="head" className="cwl-rest-mark" fill="var(--cm-hairline)" background="var(--cm-surface)" />
        <p className="cwl-rest-season">{seasonName(snapshot.seasonId)} is finished.</p>
        {/* Past zero the label goes with the digits: "Next CWL starts in"
            followed by "CWL starting soon" is the page contradicting itself in
            two lines. */}
        {past ? null : <p className="cwl-rest-label">Next CWL starts in</p>}
        {past
          ? <p className="cwl-rest-clock is-soon">CWL starting soon</p>
          : <p className="cwl-rest-clock" role="timer" aria-live="off">
              {reduced ? coarseText(remainingMs) : clockText(remainingMs)}
            </p>}
        {/* What the clock counts to, as a date rather than a rule (#124). It
            goes when the countdown does — past zero the page no longer claims
            to know. */}
        {past
          ? null
          : <p className="cwl-rest-note">{targetText(nextCwlStart(new Date()))}</p>}
        {/* THE ONE THING THE LEADER CAN DO ABOUT THE SEASON THE TIMER IS
            COUNTING TOWARD (#96). ADR 0002 required this page to read as
            absence rather than reassurance, and a control is not a claim that
            everything is fine -- it is the same anticipation the countdown
            already makes, with somewhere to put the answer. The clock stays the
            page's largest object and the finished season stays the smallest.

            It is placed here, below the note, because the note is what names
            what the countdown counts to, and the roll call is for that season
            rather than for the one that ended above it. */}
        {rollCall && !wide
          ? <div className="cwl-rest-rollcall">
              <button className="cm-button" type="button" onClick={() => setRollCallOpen(true)}>
                Roll call for {seasonName(targetMonth)}
              </button>
              {/* Only once there is something to report. "0 of 43 said yes" is
                  a true sentence that reads as a failing grade on a page whose
                  job is to be quiet; the button on its own says the same thing
                  by saying nothing. */}
              {rollCall.saidYesCount > 0
                ? <p className="cwl-rest-rollcall-count">
                    <b>{rollCall.saidYesCount}</b> of {rollCall.members.length} said yes
                  </p>
                : null}
            </div>
          : null}
      </div>

      {/* BENEATH THE COUNTDOWN, NOT BESIDE IT. Two column layouts were built and
          both were wrong in the same way: whichever surface took the main column
          claimed to be what the page is about, and the answer is that the page is
          about the season arriving and the roll call is what you can do about it.
          Stacked, that ordering is stated once and holds at every width -- which
          is also why nothing here is conditional on how close the 1st is. A page
          that reorganises itself on a date nobody chose is the hidden conditional
          ADR 0002 made the phase strip a visible control to avoid. */}
      {wide && rollCall
        ? <div className="cwl-rest-rollcall-column">
            <RollCallPanel
              rollCall={rollCall}
              search={search}
              docked
              onSearch={setSearch}
              onToggle={(playerTag, saidYes) => void toggleRollCall(playerTag, saidYes)}
              onClose={() => setRollCallOpen(false)}
            />
          </div>
        : null}

      <p className="cwl-rest-live" role="status" aria-live="polite">{status}</p>
    </main>
  );

  return <>
    {page}
    {/* Below 720px only. Above it the same panel is docked in the column above
        and this never mounts -- one component, two mountings, the caller
        deciding which, exactly as the lineup and members surfaces do. */}
    {!wide && rollCallOpen && rollCall
      ? <Sheet label="Roll call" onClose={() => setRollCallOpen(false)}>
          <RollCallPanel
            rollCall={rollCall}
            search={search}
            docked={false}
            onSearch={setSearch}
            onToggle={(playerTag, saidYes) => void toggleRollCall(playerTag, saidYes)}
            onClose={() => setRollCallOpen(false)}
          />
        </Sheet>
      : null}
  </>;
}

/* One tick applied to the loaded snapshot, count included. The count is derived
 * here rather than recomputed by the panel so the button and the panel head can
 * never disagree about it mid-save. */
function withRollCallEntry(snapshot: RollCallSnapshot, playerTag: string, saidYes: boolean): RollCallSnapshot {
  const members = snapshot.members.map((member) => member.playerTag === playerTag ? { ...member, saidYes } : member);
  return { ...snapshot, members, saidYesCount: members.filter((member) => member.saidYes).length };
}
