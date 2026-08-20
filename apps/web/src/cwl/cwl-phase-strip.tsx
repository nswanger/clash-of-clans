/* The CWL phase control (ADR 0002).
 *
 * The segmented strip one level above the day strip, reusing the same component
 * — which is the whole reason the phase model costs no new mechanism. It is
 * rendered by each phase rather than by the route, because it sits between the
 * topbar and the body and each phase owns its own topbar: the lineup's eyebrow,
 * lock chip and day menu are not the review phase's season menu.
 *
 * Two segments today. Wave 4 adds resting as the default position while lineup
 * and review stay reachable, which is why this takes the phase rather than a
 * boolean.
 */
import { CWL_PHASE_LABELS, type CwlPhase } from "./cwl-phase.js";
import "./cwl-route.css";

export function CwlPhaseStrip({ phase, onPhase, lineupDayLabel }: {
  phase: CwlPhase;
  onPhase: (next: CwlPhase) => void;
  /* The lineup segment's sub-label names the day it would open on, so switching
     phase is a choice with a stated destination rather than a jump. */
  lineupDayLabel: string;
}) {
  const sublabel = (value: CwlPhase) => value === "lineup" ? lineupDayLabel : "Season";
  return (
    <nav className="cm-segmented cwl-phasestrip" aria-label="CWL phase">
      {CWL_PHASE_LABELS.map(([key, label]) => <button
        key={key}
        type="button"
        aria-current={key === phase}
        onClick={() => onPhase(key)}
      ><span>{label}</span><small>{sublabel(key)}</small></button>)}
    </nav>
  );
}
