/* The CWL phase control (ADR 0002).
 *
 * The segmented strip one level above the day strip, reusing the same component
 * — which is the whole reason the phase model costs no new mechanism. It is
 * rendered by each phase rather than by the route, because it sits between the
 * topbar and the body and each phase owns its own topbar: the lineup's eyebrow,
 * lock chip and day menu are not the review phase's season menu.
 *
 * Three segments since wave 4, which is why this always took the phase rather
 * than a boolean. Stand down is the default position once the bonuses are
 * administered, while lineup and review stay reachable.
 */
import { CWL_PHASE_LABELS, type CwlPhase } from "./cwl-phase.js";
import { coarseText, remainingUntilNextCwl } from "./cwl-countdown.js";
import "./cwl-route.css";

export function CwlPhaseStrip({ phase, onPhase, lineupDayLabel }: {
  phase: CwlPhase;
  onPhase: (next: CwlPhase) => void;
  /* The lineup segment's sub-label names the day it would open on, so switching
     phase is a choice with a stated destination rather than a jump. Optional
     because the lineup's own loading state does not know the day yet, and a
     segment reading "Lineup / Lineup" is worse than one with no sub-label. */
  lineupDayLabel?: string | undefined;
}) {
  /* Every segment's sub-label names its destination. For stand down the
     destination is a wait, so it names its length — the same remainder the
     clock on that surface renders, floored the same way, because the two are on
     screen together and rounding made them disagree by a day.

     It is computed here rather than passed in: the remainder is calendar
     arithmetic against the client clock and needs no data, so a prop would be
     three call sites keeping the same derivation in step. The stand-down page
     re-renders every second and carries this with it; on the other two phases a
     value that changes daily is right at render. */
  const restingSublabel = (): string => {
    const remaining = remainingUntilNextCwl(new Date());
    return remaining <= 0 ? "Soon" : coarseText(remaining).replace("About ", "");
  };
  const sublabel = (value: CwlPhase) => value === "lineup" ? lineupDayLabel
    : value === "resting" ? restingSublabel()
    : "Season";
  return (
    <nav className="cm-segmented cwl-phasestrip" aria-label="CWL phase">
      {CWL_PHASE_LABELS.map(([key, label]) => <button
        key={key}
        type="button"
        aria-current={key === phase}
        onClick={() => onPhase(key)}
      ><span>{label}</span>{sublabel(key) ? <small>{sublabel(key)}</small> : null}</button>)}
    </nav>
  );
}
