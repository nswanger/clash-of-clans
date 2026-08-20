/* The CWL route (`#/cwl`), which is no longer only a lineup (ADR 0002).
 *
 * It owns exactly one decision — which phase to open in — and then gets out of
 * the way. Each phase renders its own topbar, its own phase strip and its own
 * body, because the eyebrow and the side controls belong to the phase: the
 * lineup's lock chip and day menu are not the review phase's season menu.
 *
 * The phase snapshot is a deliberately tiny load rather than a field on either
 * phase's own data. The decision has to be made BEFORE either phase fetches
 * anything, and fetching the lineup workspace to discover the season is over is
 * precisely the stale-lineup defect the phase model exists to fix.
 */
import { useEffect, useState } from "react";
import { loadCwlSeasonPhase, type CwlSeasonPhaseSnapshot } from "../data/operations.js";
import { CwlLineupWorkspacePage } from "./cwl-lineup-workspace.js";
import { CwlReviewPage } from "./cwl-review.js";
import { defaultCwlPhase, hashForPhase, phaseFromHash, type CwlPhase } from "./cwl-phase.js";

/* The day the lineup phase would open on, mirroring what
 * `loadCurrentCwlLineupWorkspace` does with no day given: the latest day still
 * in preparation or in war, and day 1 when there is none. It is the phase
 * strip's sub-label, so switching phase is a choice with a stated destination
 * rather than a jump. */
export function currentLineupDay(warDays: CwlSeasonPhaseSnapshot["warDays"]): number {
  return warDays
    .filter((day) => day.state === "preparation" || day.state === "inWar")
    .map((day) => day.warDay)
    .sort((left, right) => right - left)[0] ?? 1;
}

export function CwlRoutePage({ client, clanTag, hash }: { client: any; clanTag: string; hash: string }) {
  const [snapshot, setSnapshot] = useState<CwlSeasonPhaseSnapshot>();
  const [failed, setFailed] = useState(false);
  const requested = phaseFromHash(hash);

  useEffect(() => {
    let live = true;
    void loadCwlSeasonPhase(client, clanTag)
      .then((next) => { if (live) setSnapshot(next); })
      /* A phase we cannot derive is not a page we cannot render. The lineup is
         the app's default surface and it reports its own load failure with the
         real message; swallowing this one and falling through to it beats a
         second error screen saying less. */
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [clanTag, client]);

  /* Nothing renders while the phase is unknown. A phase strip that appears
     already switched is worse than one that appears a beat late, and #43's rule
     is that a wait under the threshold is not a wait. */
  if (!snapshot && !failed) return null;

  const phase: CwlPhase = requested
    ?? (snapshot ? defaultCwlPhase(snapshot.seasonId, snapshot.warDays.map((day) => day.state), new Date()) : "lineup");
  /* Resolved once, here, and handed to both the strip's sub-label and the
     workspace itself — so the label names the day the workspace will actually
     open on rather than a second opinion about it. */
  const lineupDay = snapshot ? currentLineupDay(snapshot.warDays) : 1;
  /* The phase travels as a query parameter (ADR 0002), so a phase is linkable
     and the back button walks the phases the leader actually visited. */
  const onPhase = (next: CwlPhase) => { window.location.hash = hashForPhase(next); };

  if (phase === "review") {
    return <CwlReviewPage client={client} clanTag={clanTag} phase={phase} onPhase={onPhase} lineupDayLabel={`Day ${lineupDay}`} />;
  }
  return <CwlLineupWorkspacePage client={client} clanTag={clanTag} phase={phase} onPhase={onPhase} initialDay={lineupDay} />;
}
