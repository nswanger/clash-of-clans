/* The stand-down countdown's arithmetic, pure and tested here (#55, #25 wave 4).
 *
 * IT CANNOT COME FROM DATA. `cwl_seasons` is populated by collection, so a
 * season that has not started is not a row — there is nothing to read a start
 * time from. The target is calendar arithmetic against the client clock: the 1st
 * of the next month at 05:00 UTC, which is when Clash rolls its day.
 *
 * That makes it a forecast, which is why the floor exists. At or past zero it
 * stops counting and says CWL is starting soon rather than running negative or
 * claiming a season is live before one is collected. The floor is not an error
 * state; it is the honest end of a guess.
 */

import { seasonMonth } from "./cwl-season-id.js";

const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

/* The season id is a key everywhere else in the app and a date exactly here:
 * this is the one place it is read rather than matched.
 *
 * An id that cannot be read as a month falls back to the id itself, which is
 * the right failure for a LABEL — a raw key on screen is poor but true, where a
 * guessed month would be a confident lie about which season finished. It read
 * that fallback in production for the whole of 2026-08 (#91), because the real
 * ids are `YYYY-MM-DD` and the pattern here only accepted `YYYY-MM`. */
export function seasonName(seasonId: string): string {
  const month = seasonMonth(seasonId);
  if (!month) return seasonId;
  return `${MONTHS[month.month - 1]} ${month.year}`;
}

/* DERIVED FROM `now`, NOT FROM THE CLOSED SEASON'S ID. If collection stalls for
 * a whole month the id is stale, and counting to the next real 1st is right
 * while counting to a date that has already passed is not.
 *
 * ON THE 1ST THE TARGET IS THAT DAY'S ROLL, AHEAD OR BEHIND. The prototype
 * always named the following month, which is wrong twice on the one day it
 * matters: before 05:00 it claimed a month's wait when the season starts in
 * hours, and after 05:00 it claimed a month's wait at the moment CWL is actually
 * starting — where the surface should be showing its floor. A target in the past
 * is what the floor reads, so this is allowed to return one. */
export function nextCwlStart(now: Date): Date {
  const monthOffset = now.getUTCDate() === 1 ? 0 : 1;
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + monthOffset, 1, 5, 0, 0));
}

export function remainingUntilNextCwl(now: Date): number {
  return nextCwlStart(now).getTime() - now.getTime();
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/* Full `DDd HH:MM:SS` all the way through rather than degrading by magnitude.
 * The drop form is the decision; showing days only until the last hour would be
 * a quieter countdown, which is the thing that was chosen against (#55). */
export function clockText(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86400);
  const time = `${pad(Math.floor((total % 86400) / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
  return days > 0 ? `${days}d ${time}` : time;
}

/* The moment the clock counts to, in a fixed UTC form (#124). It replaced a
 * sentence explaining that seasons open on the 1st at 05:00 UTC: the date is
 * the fact the sentence was carrying, and it needs no rule to read. */
export function targetText(ms: number): string {
  const at = new Date(Date.now() + Math.max(0, ms));
  const day = at.toLocaleString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
  return `${day} · ${pad(at.getUTCHours())}:${pad(at.getUTCMinutes())} UTC`;
}

/* The coarse remainder, used twice on one screen: the reduced-motion fallback
 * for the clock and the phase strip's `resting` sub-label.
 *
 * FLOOR, NOT ROUND. Both render the same remainder at the same moment, and
 * rounding made them disagree — the prototype showed "10 days" above a clock
 * reading "9d 14:27:28". A clock truncates, so this has to as well. */
export function coarseText(ms: number): string {
  const days = Math.floor(ms / 86400000);
  if (days <= 0) return "Later today";
  if (days === 1) return "About a day";
  return `About ${days} days`;
}

/* The month the roll call is being gathered for (#96).
 *
 * DERIVED FROM `nextCwlStart`, NOT FROM `now` PLUS A MONTH, and the difference
 * is not pedantry. The two agree on almost every day of the year and disagree on
 * the 1st, which is the one day it matters: `nextCwlStart` returns that day's own
 * 05:00 roll, so the roll call stays keyed to the season about to start rather
 * than skipping a month at the moment it begins. Reusing it also means the
 * control under the countdown and the countdown itself can never name different
 * months.
 *
 * `YYYY-MM`, matching `seasonMonthKey` and the `cwl_roll_call.target_month`
 * check constraint. The season id it will eventually be joined against is
 * `YYYY-MM-DD`; that join goes through `cwl_season_month` in SQL and
 * `seasonMonth` here, never a string comparison (#91). */
export function rollCallTargetMonth(now: Date): string {
  const start = nextCwlStart(now);
  return `${start.getUTCFullYear()}-${pad(start.getUTCMonth() + 1)}`;
}
