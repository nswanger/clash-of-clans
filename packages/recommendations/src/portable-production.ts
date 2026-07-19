export type PortableAvailability = "available" | "unavailable" | "unknown";
export type PortableHealthStatus = "healthy" | "stale" | "partial" | "invalid_ip" | "error";
export type PortablePriorityMode = "balanced" | "standings_first";
export type RecommendationSource = "collection" | "manual";

export type PortableReasonCode =
  | "unavailable"
  | "availability_unknown"
  | "missed_attack"
  | "preserve_core"
  | "forced_core_replacement"
  | "eight_star_rotation"
  | "current_cwl_reliability"
  | "opportunity_count"
  | "town_hall_fit"
  | "player_tag_fallback"
  | "limited_confidence";

export interface PortableMemberFacts {
  playerTag: string;
  name: string;
  townHallLevel: number;
  availability: PortableAvailability;
  assignedOpportunities: number;
  completedAssignedAttacks: number;
  stars: number;
  eightStarEligible: boolean;
  reliability: number | null;
}

export interface PortableLineupMembership {
  playerTag: string;
  position: number;
  isCore: boolean;
}

export interface PortableRecommendationContext {
  seasonTag: string;
  settings: {
    warSize: 15 | 30;
    targetCoreSize: number;
    rotationPositions: number;
    priorityMode: PortablePriorityMode;
    eightStarRotationEnabled: boolean;
  };
  members: PortableMemberFacts[];
  currentLineup: PortableLineupMembership[];
  collectionHealth: {
    status: PortableHealthStatus;
    collectedAt: string | null;
    message?: string | undefined;
  };
}

export interface PortableRecommendationResult {
  strategyVersion: string;
  changes: Array<{
    outPlayerTag: string;
    inPlayerTag: string;
    reasons: Array<{ code: PortableReasonCode; explanation: string }>;
    confidenceNote?: string;
  }>;
  exclusions: Array<{
    playerTag: string;
    reasonCode: "unavailable" | "availability_unknown";
  }>;
  contacts: Array<{ playerTag: string; reason: string }>;
  coverageGaps: Array<{ position: number; reason: string }>;
  confidenceNotes: string[];
}

export interface RecommendationContextEnvelope {
  clanTag: string;
  seasonId: string;
  warTag: string;
  input: {
    schemaVersion: 1;
    latestAvailabilityAt: string | null;
    sourceCollectionRunId: string | null;
    context: PortableRecommendationContext;
  };
}

export type RecommendationRpc = (
  name: "get_recommendation_context" | "persist_recommendation",
  args: Record<string, unknown>,
) => Promise<unknown>;

export type RecommendationGenerationResult =
  | { status: "skipped"; reason: "no_active_cwl_context" }
  | { status: "persisted"; recommendationId: string; created: boolean };

type ReplacementNeed = {
  lineup: PortableLineupMembership;
  member: PortableMemberFacts | undefined;
  reasonCodes: PortableReasonCode[];
  priority: number;
};

const explanations: Record<PortableReasonCode, string> = {
  unavailable: "The assigned member is unavailable.",
  availability_unknown: "Availability needs leader confirmation.",
  missed_attack: "The assigned member has missed an attack opportunity this CWL.",
  preserve_core: "The configured target core is preserved.",
  forced_core_replacement: "A core position requires replacement because a higher-priority rule applies.",
  eight_star_rotation: "The assigned member has reached eight stars and is eligible to rotate.",
  current_cwl_reliability: "Substitutes are ranked by assigned-attack completion in this CWL.",
  opportunity_count: "Fewer assigned opportunities break a reliability tie.",
  town_hall_fit: "Town Hall level is matched to the open map position.",
  player_tag_fallback: "Player tag provides the final deterministic tie-break.",
  limited_confidence: "This member has no assigned opportunities in the current CWL.",
};

const contactReason = "Confirm availability before considering this member.";
const coverageGapReason = "No available, unassigned substitute can cover this position.";
const compareTags = (left: string, right: string) => left.localeCompare(right, "en");
const reason = (code: PortableReasonCode) => ({ code, explanation: explanations[code] });
const limitedConfidenceNote = (playerTag: string) =>
  `Limited confidence for ${playerTag}: no assigned opportunities in the current CWL.`;

function selectCandidate(candidates: PortableMemberFacts[], outgoing: PortableMemberFacts | undefined) {
  let tied = [...candidates].sort((left, right) => compareTags(left.playerTag, right.playerTag));
  const reachedRules: PortableReasonCode[] = [];
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
  if (tied.length > 1) reachedRules.push("player_tag_fallback");
  return { candidate: tied[0], reachedRules };
}

function replacementNeed(
  lineup: PortableLineupMembership,
  member: PortableMemberFacts | undefined,
  context: PortableRecommendationContext,
): ReplacementNeed | null {
  const reasonCodes: PortableReasonCode[] = [];
  if (!member || member.availability === "unknown") reasonCodes.push("availability_unknown");
  if (member?.availability === "unavailable") reasonCodes.push("unavailable");
  const missed = member !== undefined && member.completedAssignedAttacks < member.assignedOpportunities;
  if (missed) reasonCodes.push("missed_attack");

  const rewardRotation = member !== undefined
    && context.settings.priorityMode === "balanced"
    && context.settings.eightStarRotationEnabled
    && member.eightStarEligible
    && !lineup.isCore;
  if (rewardRotation) reasonCodes.push("eight_star_rotation");
  if (reasonCodes.length === 0) return null;
  if (lineup.isCore && rewardRotation && reasonCodes.length === 1) return null;
  return {
    lineup,
    member,
    reasonCodes,
    priority: missed ? 0 : reasonCodes.some((code) => code !== "eight_star_rotation") ? 1 : 2,
  };
}

function reasonsForChange(
  need: ReplacementNeed,
  substitute: PortableMemberFacts,
  reachedRules: PortableReasonCode[],
) {
  const reasonCodes: PortableReasonCode[] = [
    ...need.reasonCodes,
    ...(need.lineup.isCore ? ["forced_core_replacement" as const] : []),
    ...reachedRules,
  ];
  if (substitute.assignedOpportunities === 0) reasonCodes.push("limited_confidence");
  return reasonCodes.map(reason);
}

export class PortableOrderedRulesStrategy {
  readonly version = "ordered-rules-v1";

  recommend(context: PortableRecommendationContext): PortableRecommendationResult {
    const membersByTag = new Map(context.members.map((member) => [member.playerTag, member]));
    const lineupTags = new Set(context.currentLineup.map(({ playerTag }) => playerTag));
    const candidates = context.members
      .filter((member) => member.availability === "available" && !lineupTags.has(member.playerTag));
    const usedCandidates = new Set<string>();
    const contacts = context.members
      .filter(({ availability }) => availability === "unknown")
      .sort((left, right) => compareTags(left.playerTag, right.playerTag))
      .map(({ playerTag }) => ({ playerTag, reason: contactReason }));
    const exclusions: PortableRecommendationResult["exclusions"] = context.members
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

    const changes: PortableRecommendationResult["changes"] = [];
    const coverageGaps: PortableRecommendationResult["coverageGaps"] = [];
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
      confidenceNotes.push(
        `Collection health is ${context.collectionHealth.status}; review data gaps before approval.`,
      );
    }
    return { strategyVersion: this.version, changes, exclusions, contacts, coverageGaps, confidenceNotes };
  }
}

export async function generateAndPersistRecommendation(
  rpc: RecommendationRpc,
  request: { clanTag: string; source: RecommendationSource },
): Promise<RecommendationGenerationResult> {
  const envelope = await rpc("get_recommendation_context", {
    requested_clan_tag: request.clanTag,
  }) as RecommendationContextEnvelope | null;
  if (!envelope) return { status: "skipped", reason: "no_active_cwl_context" };

  const strategy = new PortableOrderedRulesStrategy();
  const output = strategy.recommend(envelope.input.context);
  const persisted = await rpc("persist_recommendation", {
    requested_clan_tag: envelope.clanTag,
    requested_season_id: envelope.seasonId,
    requested_war_tag: envelope.warTag,
    requested_strategy_version: strategy.version,
    requested_input: envelope.input,
    requested_output: output,
    requested_source: request.source,
  });
  const row = Array.isArray(persisted) ? persisted[0] : persisted;
  if (!isPersistedRecommendation(row)) throw new Error("Recommendation persistence returned no identity");
  return {
    status: "persisted",
    recommendationId: row.recommendation_id,
    created: row.created,
  };
}

function isPersistedRecommendation(value: unknown): value is { recommendation_id: string; created: boolean } {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.recommendation_id === "string" && typeof candidate.created === "boolean";
}

interface ManualHandlerDependencies {
  supabaseUrl: string;
  supabaseAnonKey: string;
  allowedOrigin: string;
  fetch: typeof fetch;
}

class RpcRequestError extends Error {
  constructor(readonly status: number) {
    super(`Supabase RPC failed (${status})`);
  }
}

export function createManualRecommendationHandler(dependencies: ManualHandlerDependencies) {
  const corsHeaders = {
    "access-control-allow-headers": "authorization, x-client-info, apikey, content-type, x-retry-count",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-origin": dependencies.allowedOrigin,
    "content-type": "application/json",
  };

  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get("origin");
    if (origin && origin !== dependencies.allowedOrigin) {
      return jsonResponse({ error: "Origin is not allowed" }, 403, corsHeaders);
    }
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405, corsHeaders);
    }

    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ") || authorization.length <= "Bearer ".length) {
      return jsonResponse({ error: "Authentication required" }, 401, corsHeaders);
    }

    try {
      const body = await request.json() as { clanTag?: unknown };
      if (typeof body.clanTag !== "string" || body.clanTag.trim() === "") {
        return jsonResponse({ error: "Clan tag is required" }, 400, corsHeaders);
      }
      const rpc: RecommendationRpc = async (name, args) => {
        const response = await dependencies.fetch(`${dependencies.supabaseUrl}/rest/v1/rpc/${name}`, {
          method: "POST",
          headers: {
            apikey: dependencies.supabaseAnonKey,
            authorization,
            "content-type": "application/json",
          },
          body: JSON.stringify(args),
        });
        if (!response.ok) throw new RpcRequestError(response.status);
        return response.json();
      };
      const result = await generateAndPersistRecommendation(rpc, {
        clanTag: body.clanTag,
        source: "manual",
      });
      return jsonResponse(result, 200, corsHeaders);
    } catch (error) {
      const status = error instanceof RpcRequestError && [401, 403].includes(error.status)
        ? error.status
        : 500;
      return jsonResponse({ error: status === 500 ? "Recommendation regeneration failed" : "Access denied" }, status, corsHeaders);
    }
  };
}

function jsonResponse(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers });
}
