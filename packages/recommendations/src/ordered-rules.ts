import type {
  LineupMembership,
  MemberFacts,
  RecommendationChange,
  RecommendationContext,
  RecommendationResult,
  ReasonCode,
} from "@cwl/domain";
import {
  contactReason,
  coverageGapReason,
  limitedConfidenceNote,
  reason,
} from "./explanations.js";
import type { RecommendationStrategy } from "./strategy.js";

type ReplacementNeed = {
  lineup: LineupMembership;
  member: MemberFacts | undefined;
  reasonCodes: ReasonCode[];
  priority: number;
};

const compareTags = (left: string, right: string) => left.localeCompare(right, "en");

const candidateComparator = (outgoing: MemberFacts | undefined) =>
  (left: MemberFacts, right: MemberFacts): number => {
    const leftReliability = left.reliability ?? -1;
    const rightReliability = right.reliability ?? -1;
    if (leftReliability !== rightReliability) return rightReliability - leftReliability;
    if (left.assignedOpportunities !== right.assignedOpportunities) {
      return left.assignedOpportunities - right.assignedOpportunities;
    }
    const targetTownHall = outgoing?.townHallLevel;
    if (targetTownHall !== undefined) {
      const leftDistance = Math.abs(left.townHallLevel - targetTownHall);
      const rightDistance = Math.abs(right.townHallLevel - targetTownHall);
      if (leftDistance !== rightDistance) return leftDistance - rightDistance;
    }
    return compareTags(left.playerTag, right.playerTag);
  };

const replacementNeed = (
  lineup: LineupMembership,
  member: MemberFacts | undefined,
  context: RecommendationContext,
): ReplacementNeed | null => {
  const codes: ReasonCode[] = [];
  if (!member || member.availability === "unknown") codes.push("availability_unknown");
  if (member?.availability === "unavailable") codes.push("unavailable");
  const missed = member !== undefined && member.completedAssignedAttacks < member.assignedOpportunities;
  if (missed) codes.push("missed_attack");

  const rewardRotation = member !== undefined
    && context.settings.priorityMode === "balanced"
    && context.settings.eightStarRotationEnabled
    && member.eightStarEligible
    && !lineup.isCore;
  if (rewardRotation) codes.push("eight_star_rotation");

  if (codes.length === 0) return null;
  if (lineup.isCore && rewardRotation && codes.length === 1) return null;
  return { lineup, member, reasonCodes: codes, priority: missed ? 0 : codes.some((code) => code !== "eight_star_rotation") ? 1 : 2 };
};

const reasonsForChange = (need: ReplacementNeed, substitute: MemberFacts) => {
  const codes: ReasonCode[] = [
    ...need.reasonCodes,
    ...(need.lineup.isCore ? ["preserve_core" as const] : []),
    "current_cwl_reliability",
    "opportunity_count",
    "town_hall_fit",
    "player_tag_fallback",
  ];
  if (substitute.assignedOpportunities === 0) codes.push("limited_confidence");
  return codes.map(reason);
};

export class OrderedRulesStrategy implements RecommendationStrategy {
  readonly version = "ordered-rules-v1";

  recommend(context: RecommendationContext): RecommendationResult {
    const membersByTag = new Map(context.members.map((member) => [member.playerTag, member]));
    const lineupTags = new Set(context.currentLineup.map(({ playerTag }) => playerTag));
    const candidates = context.members
      .filter((member) => member.availability === "available" && !lineupTags.has(member.playerTag));
    const usedCandidates = new Set<string>();
    const contacts = context.members
      .filter(({ availability }) => availability === "unknown")
      .sort((left, right) => compareTags(left.playerTag, right.playerTag))
      .map(({ playerTag }) => ({ playerTag, reason: contactReason }));
    const needs = context.currentLineup
      .map((lineup) => replacementNeed(lineup, membersByTag.get(lineup.playerTag), context))
      .filter((need): need is ReplacementNeed => need !== null)
      .sort((left, right) => left.priority - right.priority || left.lineup.position - right.lineup.position);

    const changes: RecommendationChange[] = [];
    const coverageGaps: RecommendationResult["coverageGaps"] = [];
    const confidenceNotes: string[] = [];
    for (const need of needs) {
      const substitute = candidates
        .filter(({ playerTag }) => !usedCandidates.has(playerTag))
        .sort(candidateComparator(need.member))[0];
      if (!substitute) {
        coverageGaps.push({ position: need.lineup.position, reason: coverageGapReason });
        continue;
      }
      usedCandidates.add(substitute.playerTag);
      const confidenceNote = substitute.assignedOpportunities === 0
        ? limitedConfidenceNote(substitute.playerTag)
        : undefined;
      if (confidenceNote) confidenceNotes.push(confidenceNote);
      changes.push({
        outPlayerTag: need.lineup.playerTag,
        inPlayerTag: substitute.playerTag,
        reasons: reasonsForChange(need, substitute),
        ...(confidenceNote ? { confidenceNote } : {}),
      });
    }

    if (context.collectionHealth.status !== "healthy") {
      confidenceNotes.push(`Collection health is ${context.collectionHealth.status}; review data gaps before approval.`);
    }
    return { strategyVersion: this.version, changes, contacts, coverageGaps, confidenceNotes };
  }
}
