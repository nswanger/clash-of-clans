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

const selectCandidate = (candidates: MemberFacts[], outgoing: MemberFacts | undefined) => {
  let tied = [...candidates].sort((left, right) => compareTags(left.playerTag, right.playerTag));
  const reachedRules: ReasonCode[] = [];
  if (tied.length > 1) {
    reachedRules.push("current_cwl_reliability");
    const bestReliability = Math.max(...tied.map(({ reliability }) => reliability ?? -1));
    tied = tied.filter(({ reliability }) => (reliability ?? -1) === bestReliability);
  }
  if (tied.length > 1) {
    reachedRules.push("opportunity_count");
    const fewestOpportunities = Math.min(...tied.map(({ assignedOpportunities }) => assignedOpportunities));
    tied = tied.filter(({ assignedOpportunities }) => assignedOpportunities === fewestOpportunities);
  }
  if (tied.length > 1 && outgoing) {
    reachedRules.push("town_hall_fit");
    const closestTownHall = Math.min(...tied.map(({ townHallLevel }) =>
      Math.abs(townHallLevel - outgoing.townHallLevel)));
    tied = tied.filter(({ townHallLevel }) =>
      Math.abs(townHallLevel - outgoing.townHallLevel) === closestTownHall);
  }
  if (tied.length > 1) {
    reachedRules.push("player_tag_fallback");
  }
  return { candidate: tied[0], reachedRules };
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

const reasonsForChange = (need: ReplacementNeed, substitute: MemberFacts, reachedRules: ReasonCode[]) => {
  const codes: ReasonCode[] = [
    ...need.reasonCodes,
    ...(need.lineup.isCore ? ["forced_core_replacement" as const] : []),
    ...reachedRules,
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
    const exclusions: RecommendationResult["exclusions"] = context.members
      .filter(({ availability }) => availability !== "available")
      .sort((left, right) => compareTags(left.playerTag, right.playerTag))
      .map(({ playerTag, availability }) => ({
        playerTag,
        reasonCode: availability === "unavailable" ? "unavailable" : "availability_unknown",
      }));
    const needs = context.currentLineup
      .map((lineup) => replacementNeed(lineup, membersByTag.get(lineup.playerTag), context))
      .filter((need): need is ReplacementNeed => need !== null)
      .sort((left, right) => left.priority - right.priority || left.lineup.position - right.lineup.position);

    const changes: RecommendationChange[] = [];
    const coverageGaps: RecommendationResult["coverageGaps"] = [];
    const confidenceNotes: string[] = [];
    for (const need of needs) {
      const selection = selectCandidate(
        candidates.filter(({ playerTag }) => !usedCandidates.has(playerTag)),
        need.member,
      );
      const substitute = selection.candidate;
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
        reasons: reasonsForChange(need, substitute, selection.reachedRules),
        ...(confidenceNote ? { confidenceNote } : {}),
      });
    }

    if (context.collectionHealth.status !== "healthy") {
      confidenceNotes.push(`Collection health is ${context.collectionHealth.status}; review data gaps before approval.`);
    }
    return { strategyVersion: this.version, changes, exclusions, contacts, coverageGaps, confidenceNotes };
  }
}
