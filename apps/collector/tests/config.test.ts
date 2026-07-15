import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  it("requires every collector environment variable", () => {
    expect(() => loadConfig({})).toThrow(/CLASH_API_TOKEN.*CLAN_TAG.*SUPABASE_URL.*SUPABASE_SERVICE_ROLE_KEY.*TZ/);
  });

  it("returns validated non-empty values", () => {
    expect(loadConfig({
      CLASH_API_TOKEN: "fake-token",
      CLAN_TAG: "#PQLG",
      SUPABASE_URL: "https://example.invalid",
      SUPABASE_SERVICE_ROLE_KEY: "fake-service-role-key",
      TZ: "UTC",
    })).toEqual({
      clashApiToken: "fake-token",
      clanTag: "#PQLG",
      supabaseUrl: "https://example.invalid",
      supabaseServiceRoleKey: "fake-service-role-key",
      timezone: "UTC",
      logLevel: "error",
      activeCwlIntervalMs: 60 * 60 * 1_000,
      idleIntervalMs: 24 * 60 * 60 * 1_000,
    });
  });

  it("accepts supported logging and cadence overrides", () => {
    expect(loadConfig({
      CLASH_API_TOKEN: "fake-token",
      CLAN_TAG: "#PQLG",
      SUPABASE_URL: "https://example.invalid",
      SUPABASE_SERVICE_ROLE_KEY: "fake-service-role-key",
      TZ: "UTC",
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
      CLASH_API_TOKEN: "fake-token",
      CLAN_TAG: "#PQLG",
      SUPABASE_URL: "https://example.invalid",
      SUPABASE_SERVICE_ROLE_KEY: "fake-service-role-key",
      TZ: "UTC",
      [name]: value,
    })).toThrow(new RegExp(name));
  });

  it.each(["FAKECLAN", "#fake", "#BAD-I", "#BAD1"])("rejects invalid clan tag %s", (clanTag) => {
    expect(() => loadConfig({
      CLASH_API_TOKEN: "fake-token",
      CLAN_TAG: clanTag,
      SUPABASE_URL: "https://example.invalid",
      SUPABASE_SERVICE_ROLE_KEY: "fake-service-role-key",
      TZ: "UTC",
    })).toThrow(/CLAN_TAG/);
  });

  it.each(["example.invalid", "ftp://example.invalid", "not a url"])(
    "rejects invalid Supabase URL %s",
    (supabaseUrl) => {
      expect(() => loadConfig({
        CLASH_API_TOKEN: "fake-token",
        CLAN_TAG: "#PQLG",
        SUPABASE_URL: supabaseUrl,
        SUPABASE_SERVICE_ROLE_KEY: "fake-service-role-key",
        TZ: "UTC",
      })).toThrow(/SUPABASE_URL/);
    },
  );

  it("rejects an unknown IANA timezone", () => {
    expect(() => loadConfig({
      CLASH_API_TOKEN: "fake-token",
      CLAN_TAG: "#PQLG",
      SUPABASE_URL: "https://example.invalid",
      SUPABASE_SERVICE_ROLE_KEY: "fake-service-role-key",
      TZ: "Moon/Sea_of_Tranquility",
    })).toThrow(/TZ/);
  });
});
