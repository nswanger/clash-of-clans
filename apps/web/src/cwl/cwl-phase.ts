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
 * This also fixes a live defect that predates the phase model:
 * `loadCurrentCwlLineupWorkspace` picks the current day by querying for a war in
 * `preparation` or `inWar` and falling back to day 1, so between cycles the
 * default route of the app presented a stale, editable lineup for a war that
 * had already finished.
 */
import type { CwlWarState } from "../data/operations.js";

export type CwlPhase = "lineup" | "review";

export const CWL_PHASE_LABELS: ReadonlyArray<readonly [CwlPhase, string]> = [
  ["lineup", "Lineup"],
  ["review", "Review"],
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

/* The marker is the war states already loaded, with a date guard.
 *
 * The date guard is NOT redundant: a missed collection run at the end of a
 * season leaves the final day never marked ended, and without it the app would
 * sit in the lineup phase indefinitely. It is checked first for that reason —
 * a stale `inWar` on a month that is over is exactly the case it exists for. */
export function defaultCwlPhase(seasonId: string, warStates: readonly CwlWarState[], now: Date): CwlPhase {
  if (namesAnEarlierMonth(seasonId, now)) return "review";
  if (warStates.some((state) => state === "preparation" || state === "inWar")) return "lineup";
  if (warStates.some((state) => state === "warEnded")) return "review";
  /* A season with no war state at all is one that has been created and not yet
     played, which is a lineup you are about to build rather than a season to
     review. */
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

export function hashForPhase(phase: CwlPhase): string {
  return phase === "lineup" ? "#/cwl" : `#/cwl?phase=${phase}`;
}
