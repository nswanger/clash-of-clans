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
 */
import { useEffect, useState } from "react";
import { AppTopbar } from "../app-chrome.js";
import { Icon } from "../design/icon.js";
import { Mark } from "../design/mark.js";
import { setCwlBonusesAdministered, type CwlSeasonPhaseSnapshot } from "../data/operations.js";
import { clockText, coarseText, remainingUntilNextCwl, seasonName } from "./cwl-countdown.js";
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

  return (
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
        {/* The only place the forecast is admitted as a forecast, so it goes
            when the countdown does — past zero the page no longer claims to
            know. */}
        <p className="cwl-rest-note">
          {past
            ? "The new season appears here as soon as it is collected."
            : "Seasons open on the 1st of the month. This counts to 05:00 UTC."}
        </p>
      </div>

      <p className="cwl-rest-live" role="status" aria-live="polite">{status}</p>
    </main>
  );
}
