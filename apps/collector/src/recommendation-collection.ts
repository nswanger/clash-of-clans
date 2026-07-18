interface CollectionResult {
  activeCwl: boolean | null;
  runFinalized: boolean;
}

interface RecommendationCollectionDependencies<T extends CollectionResult> {
  collect: () => Promise<T>;
  generate: () => Promise<unknown>;
}

export async function collectAndGenerateRecommendation<T extends CollectionResult>(
  dependencies: RecommendationCollectionDependencies<T>,
): Promise<T> {
  const result = await dependencies.collect();
  if (result.activeCwl === true && result.runFinalized) await dependencies.generate();
  return result;
}
