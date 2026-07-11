import { describe, expect, it, vi } from "vitest";
import { ClashApiError, ClashClient } from "../src/clash-client.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("ClashClient", () => {
  it("percent-encodes tags and sends bearer authorization", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(jsonResponse({
      tag: "#FAKE/ONE",
      name: "Fixture One",
      townHallLevel: 16,
    }));
    const client = new ClashClient({ token: "secret-token", fetch });

    await client.getPlayer("#FAKE/ONE");

    expect(fetch).toHaveBeenCalledWith(
      "https://api.clashofclans.com/v1/players/%23FAKE%2FONE",
      expect.objectContaining({ headers: { authorization: "Bearer secret-token" } }),
    );
  });

  it("parses valid clan JSON", async () => {
    const client = new ClashClient({
      token: "secret-token",
      fetch: vi.fn<typeof globalThis.fetch>().mockResolvedValue(jsonResponse({
        tag: "#FAKECLAN",
        name: "Fixture Clan",
        memberList: [{ tag: "#FAKEONE", name: "Fixture One", townHallLevel: 16 }],
      })),
    });

    await expect(client.getClan("#FAKECLAN")).resolves.toMatchObject({ name: "Fixture Clan" });
  });

  it("maps invalidIp without leaking the token", async () => {
    const capturedLogs: string[] = [];
    const client = new ClashClient({
      token: "secret-token",
      fetch: vi.fn<typeof globalThis.fetch>().mockResolvedValue(
        jsonResponse({ reason: "accessDenied.invalidIp" }, 403),
      ),
      logger: { error: (message) => capturedLogs.push(message) },
    });

    await expect(client.getClan("#FAKE")).rejects.toMatchObject({ code: "invalid_ip" });
    expect(capturedLogs.join(" ")).not.toContain("secret-token");
  });

  it("maps rate limits and exposes retry timing", async () => {
    const response = jsonResponse({ reason: "rateLimitExceeded" }, 429);
    response.headers.set("retry-after", "12");
    const client = new ClashClient({
      token: "secret-token",
      fetch: vi.fn<typeof globalThis.fetch>().mockResolvedValue(response),
    });

    await expect(client.getClan("#FAKE")).rejects.toMatchObject({
      code: "rate_limited",
      retryAfterSeconds: 12,
    });
  });

  it("rejects malformed successful responses", async () => {
    const client = new ClashClient({
      token: "secret-token",
      fetch: vi.fn<typeof globalThis.fetch>().mockImplementation(async () => jsonResponse({ name: "Missing tag" })),
    });

    await expect(client.getClan("#FAKE")).rejects.toBeInstanceOf(ClashApiError);
    await expect(client.getClan("#FAKE")).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("maps absent and incomplete CWL group responses", async () => {
    const absentClient = new ClashClient({
      token: "secret-token",
      fetch: vi.fn<typeof globalThis.fetch>().mockResolvedValue(
        jsonResponse({ reason: "notFound" }, 404),
      ),
    });
    const incompleteClient = new ClashClient({
      token: "secret-token",
      fetch: vi.fn<typeof globalThis.fetch>().mockResolvedValue(jsonResponse({ state: "preparation" })),
    });

    await expect(absentClient.getLeagueGroup("#FAKE")).rejects.toMatchObject({ code: "not_found" });
    await expect(incompleteClient.getLeagueGroup("#FAKE")).rejects.toMatchObject({
      code: "incomplete_response",
    });
  });
});
