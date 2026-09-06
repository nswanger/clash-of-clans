import type { CwlMemberRating } from "../data/operations.js";
import "./cwl-rating.css";

/* The rating's two weights, stated in one place on the surface and in one place
 * in `cwl_member_overall_rating`. They cannot be shared across that boundary, so
 * the number here is a RESTATEMENT of the view's and has to move with it -- see
 * the migration's own comment on why 0.4 and not less.
 *
 * Stated once as a legend rather than beside each term: a weight repeated on
 * every row is chrome, and the reader needs it once to check the arithmetic. */
const CWL_WEIGHT_PERCENT = 60;
const REGULAR_WEIGHT_PERCENT = 40;

/* What the window covered, named by the CWL that closed it. `window_from` IS
 * the previous CWL's last war end, so its month is that CWL's month -- "since
 * the July CWL" is a claim a leader can check against their own memory in a way
 * that "the last 30 days" never was.
 *
 * The two bounds are not the same claim, and the fallback has to say it is a
 * fallback rather than borrow the rule's wording: printing one while meaning
 * the other is the failure #91 found in the season id readers, repeated here. */
export function ratingWindowLabel(rating: CwlMemberRating): string {
  if (rating.regularWindowFromBasis !== "previous_cwl_end") return "in the 30 days before this CWL";
  const month = windowMonth(rating.regularWindowFrom);
  return month ? `since the ${month} CWL` : "since last CWL";
}

/* The short form, for the lede and anywhere the long one would wrap on a phone. */
export function ratingWindowLabelShort(rating: CwlMemberRating): string {
  return rating.regularWindowFromBasis === "previous_cwl_end" ? "since last CWL" : "in the 30 days before";
}

function windowMonth(value: string | null): string | undefined {
  if (!value) return undefined;
  const at = Date.parse(value);
  if (!Number.isFinite(at)) return undefined;
  /* UTC, because the window's bounds are stored as instants and a leader east
     of the line should not see the previous month's name. */
  return new Date(at).toLocaleString("en-US", { month: "long", timeZone: "UTC" });
}

/* The basis in a sentence, or null when the rating needs no explaining. A
 * blended rating is the ordinary case and the legend under the figures already
 * says how it is made, so it gets no sentence of its own -- surfaces mark the
 * exception, never the rule. */
export function ratingBasisNote(rating: CwlMemberRating): string | null {
  if (rating.ratingBasis === "regular_only") {
    /* The window is NOT named again here. `regular_only` implies the window
       observed wars, so the evidence line directly above has just said which
       window -- and saying it twice in three lines is what a phone has least
       room for. */
    return "No CWL attacks have been assigned yet this season, so this rating is regular-war activity alone.";
  }
  if (rating.ratingBasis === "reliability_only") {
    return "No regular wars were observed in the window before this season, so this rating is this CWL's attack completion alone.";
  }
  return null;
}

/* The total lives in the panel lede; this is the breakdown under it.
 *
 * TWO SCORES IN THE GRID, THE EVIDENCE IN PROSE BENEATH IT. Both were `<dl>`
 * rows to begin with, in the same treatment, and the group read as four scores
 * rather than as two scores and the counts they came from. The distinction is
 * real -- one pair is the rating, the other is why -- so it is carried by the
 * layout rather than by the reader working it out.
 *
 * `cm-panel-label`, a `<dl>` and a muted line are all patterns the panel
 * already uses, so this introduces no component and no token. */
export function CwlRatingBreakdown({ rating }: { rating: CwlMemberRating }) {
  const note = ratingBasisNote(rating);
  const hasWindow = rating.regularWarsObserved > 0;
  /* ADR 0023 has both rating surfaces state the weights once. They ride on the
     term labels rather than in a sentence beneath (#124), and only when both
     terms are in the rating: a weight beside a dash would claim a blend that
     was never made. */
  const weighted = rating.ratingBasis === "blended";
  return (
    <>
      <p className="cm-panel-label">Rating basis</p>
      <dl className="cwl-rating-terms">
        <div>
          <dt>CWL attacks{weighted ? <> <span className="cm-sep">·</span> {CWL_WEIGHT_PERCENT}%</> : null}</dt>
          <dd>{rating.cwlScore === null ? "—" : rating.cwlScore}</dd>
        </div>
        <div>
          <dt>Regular wars{weighted ? <> <span className="cm-sep">·</span> {REGULAR_WEIGHT_PERCENT}%</> : null}</dt>
          <dd>{rating.regularScore === null ? "—" : rating.regularScore}</dd>
        </div>
      </dl>
      {/* "Joined 0 of 6" is what makes a zero readable as a zero rather than as
          missing data -- the distinction #89 exists to restore. Absent entirely
          when the window observed nothing, because "0 of 0" reads as a verdict
          and it is a coverage gap. */}
      {hasWindow
        ? <p className="cwl-rating-evidence">
            Joined <b>{rating.regularWarsParticipated} of {rating.regularWarsObserved}</b>{" "}
            {rating.regularWarsObserved === 1 ? "war" : "wars"} {ratingWindowLabel(rating)}
            {" "}<span className="cm-sep">·</span>{" "}
            <b>{rating.regularAttacksMade} of {rating.regularAvailableAttacks}</b> attacks used
          </p>
        : null}
      {note ? <p className="cwl-rating-note">{note}</p> : null}
    </>
  );
}
