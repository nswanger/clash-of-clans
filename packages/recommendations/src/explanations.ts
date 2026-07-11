import type { ReasonCode, StructuredReason } from "@cwl/domain";

const explanations: Record<ReasonCode, string> = {
  unavailable: "The assigned member is unavailable.",
  availability_unknown: "Availability needs leader confirmation.",
  missed_attack: "The assigned member has missed an attack opportunity this CWL.",
  preserve_core: "The configured target core is preserved.",
  eight_star_rotation: "The assigned member has reached eight stars and is eligible to rotate.",
  current_cwl_reliability: "Substitutes are ranked by assigned-attack completion in this CWL.",
  opportunity_count: "Fewer assigned opportunities break a reliability tie.",
  town_hall_fit: "Town Hall level is matched to the open map position.",
  player_tag_fallback: "Player tag provides the final deterministic tie-break.",
  limited_confidence: "This member has no assigned opportunities in the current CWL.",
};

export const reason = (code: ReasonCode): StructuredReason => ({ code, explanation: explanations[code] });

export const contactReason = "Confirm availability before considering this member.";
export const coverageGapReason = "No available, unassigned substitute can cover this position.";
export const limitedConfidenceNote = (playerTag: string) =>
  `Limited confidence for ${playerTag}: no assigned opportunities in the current CWL.`;
