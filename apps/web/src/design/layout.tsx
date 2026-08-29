/* The React side of the system layer.
 *
 * `components.md` describes the shipped system as "one global `clan-muster.css`
 * component layer, with thin React components emitting those classes". The
 * classes were promoted when a second surface needed them (#54 promoted the
 * summary strip); these are the thin components that go with them, and they
 * live here for the reason the CSS does — a copy per surface is how two of them
 * drift, which the metric tile had already started to do.
 */
import { useEffect, useState } from "react";

/* The panel docks instead of overlaying above this width. It is the component
 * layer's own breakpoint — `clan-muster.css` switches `cm-panel` and
 * `cm-columns` at exactly this value — so a surface reading it must not restate
 * the number. */
const WIDE_QUERY = "(min-width: 720px)";

/* A placeholder that appears and vanishes inside a tenth of a second is a flash
 * and reads as breakage rather than progress, so a fast load shows nothing at
 * all (#43, rule 1). The skeleton is scheduled, not shown. */
export const SKELETON_DELAY_MS = 250;

/* THE MOST ROWS ANY LIST SHOWS AT ONCE (ADR 0024). Everything past it is reached
 * by narrowing -- a search today, a pager on some later surface that needs one --
 * never by rendering the rest and letting the page grow.
 *
 * Ten is a round number and the ADR says so plainly; the principle is the part
 * that is fixed. Two things follow from it that a per-surface guess does not
 * give: a list sized from this holds its height whatever the filter matches, so
 * it cannot move under the query being typed into it, and a screen's worth of
 * rows stays a screen's worth however large the clan gets.
 *
 * `--cm-list-max-rows` in `tokens.css` is the CSS half of the same number. A
 * surface that sizes a box from one and slices with the other must use both. */
export const LIST_MAX_ROWS = 10;

/* One tile in `cm-summary`. `is-danger` colours the figure only, and only where
 * the same fact is marked danger on the rows below it — one fact, one colour
 * (#54). There is deliberately no success variant: a zero is the rule, and rules
 * go unmarked.
 *
 * `null` renders an em dash rather than a zero, because "we have not loaded this
 * yet" and "there are none" are different facts and a strip that shows 0 during
 * a load is asserting the second one. */
export function Metric({ value, label, danger = false }: {
  value: number | null;
  label: string;
  danger?: boolean;
}) {
  return <div className={danger ? "cm-metric is-danger" : "cm-metric"}>
    <strong>{value ?? "—"}</strong>
    <span>{label}</span>
  </div>;
}

/* Whether the panel is docked rather than overlaid. Every surface with a panel
 * asks this, and each one had its own copy of the query string and the listener
 * before wave 3 put three of them in the tree at once. */
export function useWide(): boolean {
  const [wide, setWide] = useState(() => window.matchMedia?.(WIDE_QUERY).matches ?? false);
  useEffect(() => {
    const query = window.matchMedia?.(WIDE_QUERY);
    if (!query) return;
    const update = () => setWide(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);
  return wide;
}

/* One primitive, in the shape of the row it stands in for — `cm-row` with blocks
 * instead of content, so it inherits height, padding, radius and grid from the
 * real thing and cannot drift from it (#43). No copy: loading is the most
 * literal unknown in the app, and uncertainty is expressed structurally.
 *
 * The widths are fixed rather than random so the skeleton does not reshuffle
 * between renders, which reads as content arriving and leaving again. */
export function SkeletonRows({ widths = [62, 44, 71, 51, 66, 47] }: { widths?: number[] }) {
  return <div className="cm-rows" aria-hidden="true">
    {widths.map((width, index) => <div key={index} className="cm-row has-pos is-skeleton">
      <span className="cm-row-pos"><span className="cm-skel" style={{ width: "14px" }} /></span>
      <span className="cm-row-main">
        <span className="cm-row-name"><span className="cm-skel" style={{ width: `${width}%` }} /></span>
        <span className="cm-row-meta"><span className="cm-skel" style={{ width: "72px", height: "9px" }} /></span>
      </span>
      <span className="cm-row-stats"><span className="cm-skel" style={{ width: "28px", height: "9px" }} /></span>
    </div>)}
  </div>;
}
