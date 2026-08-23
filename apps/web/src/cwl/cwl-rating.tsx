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

/* What the window actually covered, in the reader's terms. The two bounds are
 * not the same claim -- "since the last CWL" is the rule, thirty days is what
 * happens when there is no previous CWL to measure from -- and a panel that
 * prints one while meaning the other is the failure #91 found in the season id
 * readers, repeated here. */
export function ratingWindowLabel(rating: CwlMemberRating): string {
  return rating.regularWindowFromBasis === "previous_cwl_end"
    ? "since the last CWL"
    : "the 30 days before this CWL";
}

/* The basis in a sentence, or null when the rating needs no explaining. A
 * blended rating is the ordinary case and the legend under the figures already
 * says how it is made, so it gets no sentence of its own -- surfaces mark the
 * exception, never the rule. */
export function ratingBasisNote(rating: CwlMemberRating): string | null {
  if (rating.ratingBasis === "regular_only") {
    return `No CWL attacks have been assigned yet this season, so this rating is regular-war activity ${ratingWindowLabel(rating)} alone.`;
  }
  if (rating.ratingBasis === "reliability_only") {
    return "No regular wars were observed in the window before this season, so this rating is this CWL's attack completion alone.";
  }
  return null;
}

/* The total lives in the panel lede; this is the breakdown under it. Two terms
 * because they answer different questions and a leader should be able to see
 * which one is dragging somebody down.
 *
 * `cm-panel-label` and a `<dl>` are the pattern the review panel already used
 * for its own gauge, so this introduces no component and no token. */
export function CwlRatingBreakdown({ rating }: { rating: CwlMemberRating }) {
  const note = ratingBasisNote(rating);
  const hasWindow = rating.regularWarsObserved > 0;
  return (
    <>
      <p className="cm-panel-label">Rating basis</p>
      <dl className="cwl-rating-terms">
        <div>
          <dt>CWL attacks</dt>
          <dd>{rating.cwlScore === null ? "—" : rating.cwlScore}</dd>
        </div>
        <div>
          <dt>Regular wars</dt>
          <dd>{rating.regularScore === null ? "—" : rating.regularScore}</dd>
        </div>
      </dl>
      {/* The evidence under the two scores. "Joined 1 of 6" is what makes a zero
          readable as a zero rather than as missing data -- the distinction #89
          exists to restore. */}
      {hasWindow
        ? <dl className="cwl-rating-terms">
            <div>
              <dt>Wars joined</dt>
              <dd>{rating.regularWarsParticipated} of {rating.regularWarsObserved} {ratingWindowLabel(rating)}</dd>
            </div>
            <div>
              <dt>Attacks used</dt>
              <dd>{rating.regularAttacksMade} of {rating.regularAvailableAttacks} available</dd>
            </div>
          </dl>
        : null}
      {note
        ? <p className="cwl-rating-note">{note}</p>
        : <p className="cwl-rating-note">Weighted {CWL_WEIGHT_PERCENT}% CWL attacks, {REGULAR_WEIGHT_PERCENT}% regular wars.</p>}
    </>
  );
}
