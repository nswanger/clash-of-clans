import type { DailyDashboardData, DashboardMemberAction } from "./daily-dashboard.js";

type AvailabilityStatus = "available" | "unavailable" | "unknown";

interface RecommendationOutput {
  changes: Array<{
    outPlayerTag: string;
    inPlayerTag: string;
    reasons: Array<{ code: string; explanation: string }>;
    confidenceNote?: string;
  }>;
  contacts: Array<{ playerTag: string; reason: string }>;
  coverageGaps: Array<{ position: number; reason: string }>;
  confidenceNotes: string[];
}

export interface DashboardSnapshot {
  clanName: string;
  season: { clan_tag: string; season_id: string; war_size: number };
  war: { war_tag: string; war_day: number; end_time: string; attacks_per_member: number };
  members: Array<{ player_tag: string; name: string; town_hall_level: number }>;
  assignments: Array<{ player_tag: string; assigned_attacks: number }>;
  attacks: Array<{ attacker_tag: string }>;
  availability: Array<{ player_tag: string; status: AvailabilityStatus }>;
  eligibility: Array<{ player_tag: string; stars: number; eight_star_eligible: boolean }>;
  collection: { status: string; last_fresh_at: string; error_message: string | null };
  recommendation: RecommendationOutput;
  recommendationId?: string;
}

function memberAction(
  playerTag: string,
  snapshot: DashboardSnapshot,
  reason: string,
  details?: string,
): DashboardMemberAction {
  const member = snapshot.members.find(({ player_tag: tag }) => tag === playerTag);
  return {
    playerTag,
    name: member?.name ?? playerTag,
    townHallLevel: member?.town_hall_level ?? 1,
    reason,
    ...(details ? { details } : {}),
  };
}

export function mapDashboardData(snapshot: DashboardSnapshot): DailyDashboardData {
  const detailsFor = (change: RecommendationOutput["changes"][number]) => [
    `Applied rule order: ${change.reasons.map(({ code }) => code).join(" → ")}`,
    change.confidenceNote,
  ].filter(Boolean).join(" · ");
  const reasonFor = (change: RecommendationOutput["changes"][number]) =>
    change.reasons.map(({ explanation }) => explanation).join("; ");
  const warnings: NonNullable<DailyDashboardData["warnings"]> = [];

  if (snapshot.collection.status === "invalid_ip") {
    warnings.push({ code: "invalidIp", message: snapshot.collection.error_message ?? "Clash API access is blocked for this collector IP." });
  } else if (snapshot.collection.status !== "healthy") {
    warnings.push({ code: "stale", message: snapshot.collection.error_message ?? "Dashboard data may be stale or incomplete." });
  }
  for (const gap of snapshot.recommendation.coverageGaps) {
    warnings.push({ code: "coverage_gap", message: `No eligible substitute for position ${gap.position}: ${gap.reason}` });
  }
  for (const note of snapshot.recommendation.confidenceNotes) {
    warnings.push({ code: "limited_confidence", message: note });
  }

  return {
    clanName: snapshot.clanName,
    warDay: snapshot.war.war_day,
    warEndsAt: snapshot.war.end_time,
    attacksUsed: snapshot.attacks.length,
    attacksAvailable: snapshot.assignments.reduce((total, row) => total + row.assigned_attacks, 0),
    availableMembers: snapshot.availability.filter(({ status }) => status === "available").length,
    awaitingAvailability: snapshot.availability.filter(({ status }) => status === "unknown").length,
    membersAtEightStars: snapshot.eligibility.filter(({ eight_star_eligible: eligible }) => eligible).length,
    membersWithinThreeStars: snapshot.eligibility.filter(({ stars }) => stars >= 5 && stars < 8).length,
    recommendations: {
      remove: snapshot.recommendation.changes.map((change) => memberAction(change.outPlayerTag, snapshot, reasonFor(change), detailsFor(change))),
      add: snapshot.recommendation.changes.map((change) => memberAction(change.inPlayerTag, snapshot, reasonFor(change), detailsFor(change))),
    },
    ...(snapshot.recommendationId ? { recommendationId: snapshot.recommendationId, finalChanges: snapshot.recommendation.changes.map(({ outPlayerTag, inPlayerTag }) => ({ outPlayerTag, inPlayerTag })) } : {}),
    contacts: snapshot.recommendation.contacts.map((contact) => {
      const member = snapshot.members.find(({ player_tag: tag }) => tag === contact.playerTag);
      return { playerTag: contact.playerTag, name: member?.name ?? contact.playerTag, reason: contact.reason };
    }),
    warnings,
    updatedAt: snapshot.collection.last_fresh_at,
  };
}
