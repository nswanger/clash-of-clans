import type { RecommendationContext, RecommendationResult } from "@cwl/domain";
import { PortableOrderedRulesStrategy } from "./portable-production.js";
import type { RecommendationStrategy } from "./strategy.js";

export class OrderedRulesStrategy implements RecommendationStrategy {
  readonly version = "ordered-rules-v1";
  private readonly portableStrategy = new PortableOrderedRulesStrategy();

  recommend(context: RecommendationContext): RecommendationResult {
    return this.portableStrategy.recommend(context) as RecommendationResult;
  }
}
