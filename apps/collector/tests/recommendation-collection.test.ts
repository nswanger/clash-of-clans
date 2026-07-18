import { describe, expect, it, vi } from "vitest";
import { collectAndGenerateRecommendation } from "../src/recommendation-collection.js";

describe("collection recommendation generation", () => {
  it("generates after a finalized active-CWL collection", async () => {
    const events: string[] = [];
    const collect = vi.fn(async () => {
      events.push("collected");
      return { activeCwl: true, runFinalized: true };
    });
    const generate = vi.fn(async () => {
      events.push("generated");
      return { status: "persisted" as const, recommendationId: "recommendation-1", created: true };
    });

    await expect(collectAndGenerateRecommendation({ collect, generate })).resolves.toEqual({
      activeCwl: true,
      runFinalized: true,
    });
    expect(generate).toHaveBeenCalledOnce();
    expect(events).toEqual(["collected", "generated"]);
  });

  it.each([
    { activeCwl: false, runFinalized: true },
    { activeCwl: null, runFinalized: true },
    { activeCwl: true, runFinalized: false },
  ])("does not generate for $activeCwl CWL with finalized=$runFinalized", async (summary) => {
    const generate = vi.fn();

    await collectAndGenerateRecommendation({
      collect: vi.fn().mockResolvedValue(summary),
      generate,
    });

    expect(generate).not.toHaveBeenCalled();
  });
});
