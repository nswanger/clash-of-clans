import { z } from "zod";

export const availabilitySchema = z.enum(["available", "unavailable", "unknown"]);
export type Availability = z.infer<typeof availabilitySchema>;

export const priorityModeSchema = z.enum(["balanced", "standings_first"]);
export type PriorityMode = z.infer<typeof priorityModeSchema>;

export const playerTagSchema = z.string().min(1).brand<"PlayerTag">();
export const clanTagSchema = z.string().min(1).brand<"ClanTag">();
export const warTagSchema = z.string().min(1).brand<"WarTag">();
export const seasonTagSchema = z.string().min(1).brand<"SeasonTag">();
export type PlayerTag = z.infer<typeof playerTagSchema>;
export type ClanTag = z.infer<typeof clanTagSchema>;
export type WarTag = z.infer<typeof warTagSchema>;
export type SeasonTag = z.infer<typeof seasonTagSchema>;

export const seasonSettingsSchema = z.object({
  warSize: z.union([z.literal(15), z.literal(30)]),
  targetCoreSize: z.number().int().positive().optional(),
  rotationPositions: z.number().int().nonnegative().optional(),
  priorityMode: priorityModeSchema.default("balanced"),
  eightStarRotationEnabled: z.boolean().default(true),
}).transform((value) => {
  const targetCoreSize = value.targetCoreSize ?? (value.warSize === 15 ? 10 : 20);
  const rotationPositions = value.rotationPositions ?? (value.warSize === 15 ? 5 : 10);
  if (targetCoreSize + rotationPositions !== value.warSize) {
    throw new Error("Core and rotation positions must equal war size");
  }
  return { ...value, targetCoreSize, rotationPositions };
});
export type SeasonSettings = z.infer<typeof seasonSettingsSchema>;

export const memberFactsSchema = z.object({
  playerTag: playerTagSchema,
  name: z.string().min(1),
  townHallLevel: z.number().int().positive(),
  availability: availabilitySchema,
  assignedOpportunities: z.number().int().nonnegative(),
  completedAssignedAttacks: z.number().int().nonnegative(),
  stars: z.number().int().nonnegative(),
  eightStarEligible: z.boolean(),
}).superRefine((value, context) => {
  if (value.completedAssignedAttacks > value.assignedOpportunities) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["completedAssignedAttacks"],
      message: "Completed assigned attacks cannot exceed assigned opportunities",
    });
  }
}).transform((value) => ({
  ...value,
  reliability: value.assignedOpportunities === 0
    ? null
    : value.completedAssignedAttacks / value.assignedOpportunities,
}));
export type MemberFacts = z.infer<typeof memberFactsSchema>;

export const lineupMembershipSchema = z.object({
  playerTag: playerTagSchema,
  position: z.number().int().positive(),
  isCore: z.boolean(),
});
export type LineupMembership = z.infer<typeof lineupMembershipSchema>;

export const reasonCodeSchema = z.enum([
  "unavailable",
  "availability_unknown",
  "missed_attack",
  "preserve_core",
  "eight_star_rotation",
  "current_cwl_reliability",
  "opportunity_count",
  "town_hall_fit",
  "player_tag_fallback",
  "limited_confidence",
]);
export type ReasonCode = z.infer<typeof reasonCodeSchema>;

export const structuredReasonSchema = z.object({
  code: reasonCodeSchema,
  explanation: z.string().min(1),
});
export type StructuredReason = z.infer<typeof structuredReasonSchema>;

export const recommendationChangeSchema = z.object({
  outPlayerTag: playerTagSchema,
  inPlayerTag: playerTagSchema,
  reasons: z.array(structuredReasonSchema).min(1),
  confidenceNote: z.string().min(1).optional(),
});
export type RecommendationChange = z.infer<typeof recommendationChangeSchema>;

export const contactSchema = z.object({
  playerTag: playerTagSchema,
  reason: z.string().min(1),
});
export type Contact = z.infer<typeof contactSchema>;

export const coverageGapSchema = z.object({
  position: z.number().int().positive(),
  reason: z.string().min(1),
});
export type CoverageGap = z.infer<typeof coverageGapSchema>;

export const collectionHealthSchema = z.object({
  status: z.enum(["healthy", "stale", "partial", "invalid_ip", "error"]),
  collectedAt: z.string().datetime().nullable(),
  message: z.string().min(1).optional(),
});
export type CollectionHealth = z.infer<typeof collectionHealthSchema>;

export const recommendationContextSchema = z.object({
  seasonTag: seasonTagSchema,
  settings: seasonSettingsSchema,
  members: z.array(memberFactsSchema),
  currentLineup: z.array(lineupMembershipSchema),
  collectionHealth: collectionHealthSchema,
});
export type RecommendationContext = z.infer<typeof recommendationContextSchema>;

export const recommendationResultSchema = z.object({
  strategyVersion: z.string().min(1),
  changes: z.array(recommendationChangeSchema),
  contacts: z.array(contactSchema),
  coverageGaps: z.array(coverageGapSchema),
  confidenceNotes: z.array(z.string().min(1)),
});
export type RecommendationResult = z.infer<typeof recommendationResultSchema>;

export const leaderDecisionStatusSchema = z.enum(["proposed", "approved", "overridden"]);
export type LeaderDecisionStatus = z.infer<typeof leaderDecisionStatusSchema>;

const leaderDecisionBaseSchema = z.object({
  proposalId: z.string().min(1),
  proposal: recommendationResultSchema,
  proposedAt: z.string().datetime(),
});

export const proposedLeaderDecisionSchema = leaderDecisionBaseSchema.extend({
  status: z.literal("proposed"),
});

export const approvedLeaderDecisionSchema = leaderDecisionBaseSchema.extend({
  status: z.literal("approved"),
  actorId: z.string().min(1),
  decidedAt: z.string().datetime(),
  finalChanges: z.array(recommendationChangeSchema),
});

export const overriddenLeaderDecisionSchema = leaderDecisionBaseSchema.extend({
  status: z.literal("overridden"),
  actorId: z.string().min(1),
  decidedAt: z.string().datetime(),
  overrideNote: z.string().min(1),
  finalChanges: z.array(recommendationChangeSchema),
});

export const leaderDecisionSchema = z.discriminatedUnion("status", [
  proposedLeaderDecisionSchema,
  approvedLeaderDecisionSchema,
  overriddenLeaderDecisionSchema,
]);
export type LeaderDecision = z.infer<typeof leaderDecisionSchema>;
