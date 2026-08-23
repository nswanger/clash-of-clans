/* Which phase the CWL route is in (ADR 0002).
 *
 * The route is conditional on the season's phase because the lineup workspace
 * and the review surface are EXACTLY COMPLEMENTARY IN TIME: the workspace is
 * inert between cycles, and review is impossible during one, because bonus
 * decisions need final stars. They can never both want to be on screen, which
 * is the case where one route with two phases is correct rather than clever.
 *
 * THE PHASE IS AN EXPLICIT CONTROL THAT DEFAULTS TO THE CURRENT PHASE, not a
 * hidden conditional. Three reasons it is visible: a route that changes meaning
 * on hidden state cannot be linked or reasoned about; a leader mid-season needs
 * to reach the previous season's bonus decisions; and wars end at a fixed time
 * while collection is periodic, so there is a window in which CWL is genuinely
 * over and the app still believes it is live. Under a hidden conditional that
 * window strands the leader on a stale lineup with no way out. Under a control
 * it is one tap.
 *
 * WAVE 4 ADDS THE THIRD POSITION. Once the bonuses are administered neither of
 * those two surfaces has anything to say, and the route rests rather than keep
 * presenting a finished season as though something were outstanding. It is where
 * bare `#/cwl` lands from then until the next season is collected, and lineup
 * and review both stay reachable from the strip (#55).
 *
 * This also fixes a live defect that predates the phase model:
 * `loadCurrentCwlLineupWorkspace` picks the current day by querying for a war in
 * `preparation` or `inWar` and falling back to day 1, so between cycles the
 * default route of the app presented a stale, editable lineup for a war that
 * had already finished.
 */
import type { CwlWarState } from "../data/operations.js";

export type CwlPhase = "lineup" | "review" | "resting";

/* The label a leader reads is `Stand down`; the model's word stays `resting`.
 * The other two segments are `Lineup` and `Review`, which are what a leader
 * calls those states — "resting" is how ADR 0002 and this union describe it, not
 * what anyone says out loud. `Muster` was rejected outright: it is the product's
 * own name in the auth shell's h1. */
export const CWL_PHASE_LABELS: ReadonlyArray<readonly [CwlPhase, string]> = [
  ["lineup", "Lineup"],
  ["review", "Review"],
  ["resting", "Stand down"],
];

const PHASES: readonly CwlPhase[] = CWL_PHASE_LABELS.map(([phase]) => phase);

/* The season id is the Clash API's own `"YYYY-MM"`, so an earlier month is a
 * string comparison rather than a date parse — and an id that is not in that
 * shape simply fails the guard instead of throwing, which is the right failure:
 * the war states below are the primary marker and the guard is a backstop. */
function namesAnEarlierMonth(seasonId: string, now: Date): boolean {
  if (!/^\d{4}-\d{2}$/.test(seasonId)) return false;
  const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  return seasonId < currentMonth;
}

/* The elapsed-time backstop for a season nobody ever marks administered. ADR
 * 0002 set the marker on this before #54 amended it to the observation; it
 * survives as the fallback rather than the rule. */
const RESTING_AFTER_FINAL_WAR_DAYS = 7;
const RESTING_AFTER_FINAL_WAR_MS = RESTING_AFTER_FINAL_WAR_DAYS * 86400000;

/* The day-of-month floor on the collection-failure backstop, and the reason it
 * is not simply `namesAnEarlierMonth`. That guard flips at midnight on the 1st,
 * which is roughly when the NEXT CWL starts — so on its own it would drop a
 * leader into stand down at exactly the moment the new season begins. Past
 * roughly day 8 with the previous season still current, the reading is safe:
 * the new season should have been collected long since, and it has not. */
const RESTING_DAY_OF_MONTH_FLOOR = 8;

export interface CwlPhaseWarDay {
  state: CwlWarState;
  /* Null for a war day collection has seen but never timed, which is exactly the
     case marker 2 has nothing to measure and marker 3 exists for. */
  endTime: string | null;
}

function finalWarEndTime(warDays: readonly CwlPhaseWarDay[]): number | undefined {
  const ends = warDays
    .map((day) => day.endTime === null ? Number.NaN : Date.parse(day.endTime))
    .filter((value) => Number.isFinite(value));
  return ends.length ? Math.max(...ends) : undefined;
}

/* What the phase decision reads, which is what `loadCwlSeasonPhase` selects.
 * An object rather than four positional arguments: the ladder grew from one
 * marker to five and a call site of loose strings and dates is a bug waiting to
 * be written the wrong way round. */
export interface CwlPhaseMarkers {
  seasonId: string;
  warDays: readonly CwlPhaseWarDay[];
  bonusesAdministeredAt: string | null;
}

/* THE LADDER, and the order is the whole of it.
 *
 * The first two rungs are the resting markers and they run BEFORE the war
 * states, because both are observations that the season is over which the states
 * cannot contradict: an administered bonus is a leader saying so, and a final
 * war that ended more than a week ago is over whatever its row still claims.
 *
 * The rungs after them are unchanged from the two-phase model, with the earlier
 * -month guard now forking on the day of the month rather than always reading
 * review. That guard is NOT redundant with the states: a missed collection run
 * at the end of a season leaves the final day never marked ended, and without it
 * the app sits in the lineup phase indefinitely — presenting a stale, editable
 * lineup for a war that finished weeks ago (ADR 0002). */
export function defaultCwlPhase({ seasonId, warDays, bonusesAdministeredAt }: CwlPhaseMarkers, now: Date): CwlPhase {
  /* Marker 1: the observation. Wave 3 shipped the column and the control that
     writes it, so this is what someone did rather than a guess about when they
     lost interest (#54). */
  if (bonusesAdministeredAt !== null) return "resting";

  /* Marker 2: elapsed time since the final war ended. */
  const finalEnd = finalWarEndTime(warDays);
  if (finalEnd !== undefined && now.getTime() - finalEnd >= RESTING_AFTER_FINAL_WAR_MS) return "resting";

  /* Marker 3: the collection-failure backstop. A season whose end was never
     collected has no `end_time` at all, so marker 2 has nothing to measure and
     this is the only rung that can fire — which is why it carries the floor. */
  if (namesAnEarlierMonth(seasonId, now)) {
    return now.getUTCDate() >= RESTING_DAY_OF_MONTH_FLOOR ? "resting" : "review";
  }

  if (warDays.some((day) => day.state === "preparation" || day.state === "inWar")) return "lineup";
  if (warDays.some((day) => day.state === "warEnded")) return "review";
  /* A season with no war state at all is one that has been created and not yet
     played, which is a lineup you are about to build rather than a season to
     review. It is also how stand down self-clears: the new season is collected,
     becomes the current one with no war states, and this returns lineup with
     nothing having had to detect the season starting. */
  return "lineup";
}

/* The phase travels as a query parameter, which `routeForPath` already
 * tolerates — it splits the hash on `?` before matching the path. A parameter
 * naming something that is not a phase is ignored rather than rejected: the
 * default is always a correct answer, and a bad link should land somewhere
 * usable. */
export function phaseFromHash(hash: string): CwlPhase | undefined {
  const query = hash.split("?")[1];
  if (!query) return undefined;
  const requested = new URLSearchParams(query).get("phase");
  return PHASES.find((phase) => phase === requested);
}

/* ALWAYS NAMES THE PHASE, including the one the route would have defaulted to.
 *
 * The tempting version omits the parameter for the default, on the grounds that
 * a URL should not restate state it would have chosen anyway. That version
 * strands the leader, and in exactly the direction ADR 0002 wrote the control to
 * prevent. Once the season is over the default at bare `#/cwl` IS review, so
 * pressing Lineup would assign the identical hash — no `hashchange`, no
 * re-render, nothing moves, and the only way back to the lineup is typing the
 * query string by hand.
 *
 * Naming it also makes the control's whole promise true: after one tap the URL
 * says which phase you are in, so it can be linked and reasoned about. A bare
 * `#/cwl` still means "whichever phase the season is in", which is what a
 * bookmark or the nav menu should give you. */
export function hashForPhase(phase: CwlPhase, seasonId?: string): string {
  const season = seasonId ? `&season=${encodeURIComponent(seasonId)}` : "";
  return `#/cwl?phase=${phase}${season}`;
}

/* Which season the review phase is looking at (#56), read the same way and with
 * the same tolerance as the phase: a parameter naming a season the clan has
 * never collected is ignored by the loader rather than rejected.
 *
 * ONLY REVIEW CARRIES IT, and the omission is the point rather than an
 * oversight. The lineup is the season being played and stand down is the season
 * just finished; neither has a previous-season reading to offer, so a `season`
 * beside them would name a scope the surface does not honour. Leaving review
 * for another phase therefore drops the parameter, which is also what a leader
 * means by pressing `Lineup`: show me the war I am fighting, not the month I
 * was reading about. */
export function seasonFromHash(hash: string): string | undefined {
  const query = hash.split("?")[1];
  if (!query) return undefined;
  return new URLSearchParams(query).get("season") ?? undefined;
}
