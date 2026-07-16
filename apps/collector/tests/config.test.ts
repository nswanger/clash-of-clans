import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

const validEnvironment = {
  CLASH_API_TOKEN: "fake-token",
  CLAN_TAG: "#PQLG",
  SUPABASE_URL: "https://example.invalid",
  SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test-value",
  TZ: "UTC",
};

describe("loadConfig", () => {
  it("requires every collector environment variable", () => {
    expect(() => loadConfig({})).toThrow(/CLASH_API_TOKEN.*CLAN_TAG.*SUPABASE_URL.*SUPABASE_SERVICE_ROLE_KEY.*TZ/);
  });

  it("returns validated non-empty values", () => {
    expect(loadConfig(validEnvironment)).toEqual({
      clashApiToken: "fake-token",
      clanTag: "#PQLG",
      supabaseUrl: "https://example.invalid",
      supabaseServiceRoleKey: "sb_secret_test-value",
      timezone: "UTC",
      logLevel: "error",
      activeCwlIntervalMs: 60 * 60 * 1_000,
      idleIntervalMs: 24 * 60 * 60 * 1_000,
    });
  });

  it("accepts a legacy JWT-based service_role key", () => {
    expect(loadConfig({
      ...validEnvironment,
      SUPABASE_SERVICE_ROLE_KEY: "header.payload.signature",
    }).supabaseServiceRoleKey).toBe("header.payload.signature");
  });

  it.each([
    "sb_publishable_test-value",
    "sbp_test-value",
    "not-a-server-key",
  ])("rejects non-server Supabase credential %s without revealing it", (credential) => {
    expect(() => loadConfig({
      ...validEnvironment,
      SUPABASE_SERVICE_ROLE_KEY: credential,
    })).toThrow(/SUPABASE_SERVICE_ROLE_KEY.*sb_secret.*service_role/);

    try {
      loadConfig({ ...validEnvironment, SUPABASE_SERVICE_ROLE_KEY: credential });
    } catch (error) {
      expect((error as Error).message).not.toContain(credential);
    }
  });

  it("accepts supported logging and cadence overrides", () => {
    expect(loadConfig({
      ...validEnvironment,
      LOG_LEVEL: "silent",
      ACTIVE_CWL_INTERVAL_MINUTES: "15",
      IDLE_INTERVAL_HOURS: "6",
    })).toMatchObject({
      logLevel: "silent",
      activeCwlIntervalMs: 15 * 60 * 1_000,
      idleIntervalMs: 6 * 60 * 60 * 1_000,
    });
  });

  it.each([
    ["LOG_LEVEL", "debug"],
    ["ACTIVE_CWL_INTERVAL_MINUTES", "0"],
    ["ACTIVE_CWL_INTERVAL_MINUTES", "1.5"],
    ["IDLE_INTERVAL_HOURS", "tomorrow"],
  ])("rejects invalid optional setting %s=%s", (name, value) => {
    expect(() => loadConfig({
      ...validEnvironment,
      [name]: value,
    })).toThrow(new RegExp(name));
  });

  it.each(["FAKECLAN", "#fake", "#BAD-I", "#BAD1"])("rejects invalid clan tag %s", (clanTag) => {
    expect(() => loadConfig({
      ...validEnvironment,
      CLAN_TAG: clanTag,
    })).toThrow(/CLAN_TAG/);
  });

  it.each(["example.invalid", "ftp://example.invalid", "not a url"])(
    "rejects invalid Supabase URL %s",
    (supabaseUrl) => {
      expect(() => loadConfig({
        ...validEnvironment,
        SUPABASE_URL: supabaseUrl,
      })).toThrow(/SUPABASE_URL/);
    },
  );

  it("rejects an unknown IANA timezone", () => {
    expect(() => loadConfig({
      ...validEnvironment,
      TZ: "Moon/Sea_of_Tranquility",
    })).toThrow(/TZ/);
  });
});
