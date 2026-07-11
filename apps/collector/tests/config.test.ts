import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  it("requires every collector environment variable", () => {
    expect(() => loadConfig({})).toThrow(/CLASH_API_TOKEN.*CLAN_TAG.*SUPABASE_URL.*SUPABASE_SERVICE_ROLE_KEY.*TZ/);
  });

  it("returns validated non-empty values", () => {
    expect(loadConfig({
      CLASH_API_TOKEN: "fake-token",
      CLAN_TAG: "#FAKECLAN",
      SUPABASE_URL: "https://example.invalid",
      SUPABASE_SERVICE_ROLE_KEY: "fake-service-role-key",
      TZ: "UTC",
    })).toEqual({
      clashApiToken: "fake-token",
      clanTag: "#FAKECLAN",
      supabaseUrl: "https://example.invalid",
      supabaseServiceRoleKey: "fake-service-role-key",
      timezone: "UTC",
    });
  });
});
