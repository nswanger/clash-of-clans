import type { RecommendationContext, RecommendationResult } from "@cwl/domain";

export interface RecommendationStrategy {
  readonly version: string;
  recommend(context: RecommendationContext): RecommendationResult;
}

export { OrderedRulesStrategy } from "./ordered-rules.js";
export {
  createManualRecommendationHandler,
  generateAndPersistRecommendation,
} from "./portable-production.js";
export type {
  RecommendationGenerationResult,
  RecommendationRpc,
  RecommendationSource,
} from "./portable-production.js";
