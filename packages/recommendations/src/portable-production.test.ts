import { describe, expect, it, vi } from "vitest";
import {
  createManualRecommendationHandler,
  generateAndPersistRecommendation,
  type RecommendationContextEnvelope,
} from "./portable-production.js";

const contextEnvelope: RecommendationContextEnvelope = {
  clanTag: "#CLAN",
  seasonId: "2026-07",
  warTag: "#WAR1",
  input: {
    schemaVersion: 1,
    latestAvailabilityAt: "2026-07-18T17:00:00.000Z",
    sourceCollectionRunId: "run-1",
    context: {
      seasonTag: "2026-07",
      settings: {
        warSize: 15,
        targetCoreSize: 10,
        rotationPositions: 5,
        priorityMode: "balanced",
        eightStarRotationEnabled: true,
      },
      members: [
        {
          playerTag: "#OUT",
          name: "Outgoing",
          townHallLevel: 17,
          availability: "unavailable",
          assignedOpportunities: 1,
          completedAssignedAttacks: 1,
          stars: 3,
          eightStarEligible: false,
          reliability: 1,
        },
        {
          playerTag: "#IN",
          name: "Incoming",
          townHallLevel: 17,
          availability: "available",
          assignedOpportunities: 1,
          completedAssignedAttacks: 1,
          stars: 3,
          eightStarEligible: false,
          reliability: 1,
        },
      ],
      currentLineup: [{ playerTag: "#OUT", position: 1, isCore: true }],
      collectionHealth: {
        status: "healthy",
        collectedAt: "2026-07-18T16:55:00.000Z",
      },
    },
  },
};

describe("production recommendation derivation", () => {
  it("persists an ordered-rules recommendation from canonical context", async () => {
    const rpc = vi.fn(async (name: string) => {
      if (name === "get_recommendation_context") return contextEnvelope;
      if (name === "persist_recommendation") {
        return [{ recommendation_id: "recommendation-1", created: true }];
      }
      throw new Error(`Unexpected RPC ${name}`);
    });

    await expect(generateAndPersistRecommendation(rpc, {
      clanTag: "#CLAN",
      source: "collection",
    })).resolves.toEqual({
      status: "persisted",
      recommendationId: "recommendation-1",
      created: true,
    });

    expect(rpc).toHaveBeenNthCalledWith(1, "get_recommendation_context", {
      requested_clan_tag: "#CLAN",
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "persist_recommendation", expect.objectContaining({
      requested_clan_tag: "#CLAN",
      requested_season_id: "2026-07",
      requested_war_tag: "#WAR1",
      requested_strategy_version: "ordered-rules-v1",
      requested_input: contextEnvelope.input,
      requested_source: "collection",
      requested_output: expect.objectContaining({
        changes: [expect.objectContaining({ outPlayerTag: "#OUT", inPlayerTag: "#IN" })],
      }),
    }));
  });

  it("skips persistence when no normalized CWL lineup is available", async () => {
    const rpc = vi.fn().mockResolvedValue(null);

    await expect(generateAndPersistRecommendation(rpc, {
      clanTag: "#CLAN",
      source: "collection",
    })).resolves.toEqual({ status: "skipped", reason: "no_active_cwl_context" });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});

describe("manual recommendation handler", () => {
  it("allows the headers sent by the Supabase browser client", async () => {
    const handler = createManualRecommendationHandler({
      supabaseUrl: "https://project.supabase.co",
      supabaseAnonKey: "publishable-key",
      allowedOrigin: "https://example.github.io",
      fetch: vi.fn(),
    });

    const response = await handler(new Request("https://function.example", {
      method: "OPTIONS",
      headers: { origin: "https://example.github.io" },
    }));

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-headers")).toBe(
      "authorization, x-client-info, apikey, content-type, x-retry-count",
    );
  });

  it("requires the signed-in leader authorization header", async () => {
    const handler = createManualRecommendationHandler({
      supabaseUrl: "https://project.supabase.co",
      supabaseAnonKey: "publishable-key",
      allowedOrigin: "https://example.github.io",
      fetch: vi.fn(),
    });

    const response = await handler(new Request("https://function.example", {
      method: "POST",
      headers: { origin: "https://example.github.io" },
      body: JSON.stringify({ clanTag: "#CLAN" }),
    }));

    expect(response.status).toBe(401);
  });

  it("uses the caller token for an immediate manual regeneration", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(contextEnvelope), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([
        { recommendation_id: "recommendation-1", created: true },
      ]), { status: 200 }));
    const handler = createManualRecommendationHandler({
      supabaseUrl: "https://project.supabase.co",
      supabaseAnonKey: "publishable-key",
      allowedOrigin: "https://example.github.io",
      fetch,
    });

    const response = await handler(new Request("https://function.example", {
      method: "POST",
      headers: {
        authorization: "Bearer signed-user-token",
        origin: "https://example.github.io",
      },
      body: JSON.stringify({ clanTag: "#CLAN" }),
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "persisted",
      recommendationId: "recommendation-1",
      created: true,
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0]?.[1]).toEqual(expect.objectContaining({
      headers: expect.objectContaining({ authorization: "Bearer signed-user-token" }),
    }));
  });
});
