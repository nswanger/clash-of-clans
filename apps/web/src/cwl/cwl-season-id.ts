/* Reading a CWL season id as a month (#91).
 *
 * THE ID IS THE CLASH API'S OWN `season` FIELD, STORED VERBATIM. Checked
 * against stored `raw_snapshots` for `league_group`, the API returns
 * `"2026-08-01"` — a DATE, not `"YYYY-MM"` — and `normalize.ts` stores what it
 * is given. Two readers assumed `YYYY-MM`, matched nothing, and fell through to
 * a wrong-but-quiet answer: the stand-down surface printed the raw key where it
 * meant to print a month, and the phase ladder's collection-failure backstop
 * never fired.
 *
 * THE ID IS NOT NORMALISED AT THE COLLECTOR, and that was the decision rather
 * than the default. `season_id` is half the key of `cwl_seasons` and a column on
 * `cwl_wars`, `cwl_members`, `member_availability`, the lineup plans, the applied
 * baselines and the recommendations, and it is interpolated into `audit_events`
 * entity ids like `#CLAN:2026-08-01:3`. Rewriting all of that — audit history
 * included — to change how two lines of TypeScript read a string is a large,
 * irreversible data migration bought for cosmetics. Storing the upstream value
 * unchanged is also what keeps raw pulls separable from derived readings.
 *
 * So the id stays a key, and reading it as a month happens HERE, once.
 *
 * BOTH SHAPES PARSE. Production emits `YYYY-MM-DD`; `YYYY-MM` is accepted
 * because the API's contract is not ours to assume and a season already stored
 * in the shorter form must keep working. Anything else returns undefined, which
 * each caller handles explicitly — see the comments at both call sites, because
 * "cannot read this as a month" means something different to a label than it
 * does to a phase decision.
 */

const SEASON_ID = /^(\d{4})-(\d{2})(?:-\d{2})?$/;

export interface SeasonMonth {
  year: number;
  /* 1-12, as written, NOT a JavaScript month index. The id is read far more
     often than it is handed to `Date`, and a silently zero-based field is the
     kind of off-by-one that reads correctly right up until it does not. */
  month: number;
}

export function seasonMonth(seasonId: string): SeasonMonth | undefined {
  const match = SEASON_ID.exec(seasonId);
  if (!match) return undefined;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return undefined;
  return { year: Number(match[1]), month };
}

/* `"2026-08"` sorts correctly against `"2026-09"` and so does `"2026-08-01"`,
 * but the two shapes do not sort against EACH OTHER the way a reader expects,
 * and the phase ladder compares a season id to the current month. So the
 * comparison is made on a canonical form rather than on the stored string. */
export function seasonMonthKey(month: SeasonMonth): string {
  return `${month.year}-${String(month.month).padStart(2, "0")}`;
}
