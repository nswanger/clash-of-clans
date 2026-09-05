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
  clanRole: z.enum(["leader", "coLeader", "elder", "member", "unknown"]).default("unknown"),
  availability: availabilitySchema,
  assignedOpportunities: z.number().int().nonnegative(),
  completedAssignedAttacks: z.number().int().nonnegative(),
  stars: z.number().int().nonnegative(),
  eightStarEligible: z.boolean(),
  regularWarsObserved: z.number().int().nonnegative().default(0),
  regularWarsParticipated: z.number().int().nonnegative().default(0),
  /* Every attack the window's wars offered, sat-out wars included. It is the
     denominator that makes a non-participant a real zero rather than a missing
     row, so it is NOT `regularAssignedAttacks` -- that one counts only the wars
     the member actually appeared in (#89). */
  regularAvailableAttacks: z.number().int().nonnegative().default(0),
  regularAssignedAttacks: z.number().int().nonnegative().default(0),
  regularAttacksMade: z.number().int().nonnegative().default(0),
  regularStars: z.number().int().nonnegative().default(0),
  regularActivityScore: z.number().min(0).max(100).nullable().default(null),
  regularPerformanceScore: z.number().min(0).max(100).nullable().default(null),
  regularStarsPerAttack: z.number().min(0).max(3).nullable().default(null),
  regularOpportunityScore: z.number().min(0).max(100).nullable().default(null),
  regularQualityScore: z.number().min(0).max(100).nullable().default(null),
  regularScore: z.number().min(0).max(100).nullable().default(null),
  regularLastObservedAt: z.string().datetime().nullable().default(null),
  regularWindowFrom: z.string().datetime().nullable().default(null),
  regularWindowTo: z.string().datetime().nullable().default(null),
  cwlScore: z.number().min(0).max(100).nullable().default(null),
  /* Which evidence `overallRating` is made of, recorded rather than inferred:
     "ranked on regular-war history alone" is a materially different claim from
     "ranked on this CWL's attacks", and a reader cannot tell them apart from
     the number. */
  ratingBasis: z.enum(["blended", "reliability_only", "regular_only"]).nullable().default(null),
  overallRating: z.number().min(0).max(100).nullable().default(null),
  bonusPriorityScore: z.number().min(0).max(100).nullable().default(null),
}).superRefine((value, context) => {
  if (value.completedAssignedAttacks > value.assignedOpportunities) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["completedAssignedAttacks"],
      message: "Completed assigned attacks cannot exceed assigned opportunities",
    });
  }
  if (value.regularAttacksMade > value.regularAssignedAttacks) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["regularAttacksMade"],
      message: "Regular-war attacks made cannot exceed assigned attacks",
    });
  }
  if (value.regularWarsParticipated > value.regularWarsObserved) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["regularWarsParticipated"],
      message: "Regular wars participated cannot exceed observed wars",
    });
  }
}).transform((value) => ({
  ...value,
  reliability: value.assignedOpportunities === 0
    ? null
    : value.completedAssignedAttacks / value.assignedOpportunities,
}));
export type MemberFacts = z.infer<typeof memberFactsSchema>;
