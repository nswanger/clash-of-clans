import { describe, expect, it } from "vitest";
import {
  buildSupabaseRequestHeaders,
  isSupportedSupabaseServerKey,
} from "../src/supabase-auth.js";

const legacyServiceRoleKey = "header.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.signature";
const legacyAnonKey = "header.eyJyb2xlIjoiYW5vbiJ9.signature";

describe("Supabase server credentials", () => {
  it("uses a current secret key only as an API key", () => {
    expect(buildSupabaseRequestHeaders("sb_secret_test-value")).toEqual({
      apikey: "sb_secret_test-value",
      "content-type": "application/json",
    });
  });

  it("preserves bearer authorization for a legacy service_role JWT", () => {
    const key = legacyServiceRoleKey;
    expect(buildSupabaseRequestHeaders(key, "return=representation")).toEqual({
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      prefer: "return=representation",
    });
  });

  it.each([
    ["sb_secret_test-value", true],
    [legacyServiceRoleKey, true],
    [legacyAnonKey, false],
    ["header.payload.signature", false],
    ["sb_publishable_test-value", false],
    ["sbp_test-value", false],
    ["not-a-server-key", false],
  ])("classifies %s as supported=%s", (key, supported) => {
    expect(isSupportedSupabaseServerKey(key)).toBe(supported);
  });
});
