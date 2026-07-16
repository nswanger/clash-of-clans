# Supabase Secret Header Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the collector safely support current `sb_secret_...` Supabase server keys while preserving legacy JWT-based `service_role` compatibility and rejecting incorrect credentials before network access.

**Architecture:** Add one pure authentication helper that owns supported-key detection and REST header construction. Configuration validates the credential with that helper, and the existing Supabase repository delegates all header construction to it.

**Tech Stack:** TypeScript, Node.js fetch, Vitest, pnpm workspace, Docker Compose.

## Global Constraints

- Keep the environment variable name `SUPABASE_SERVICE_ROLE_KEY` for deployment compatibility.
- Never print, partially reveal, commit, or place a server credential in frontend configuration.
- Do not add dependencies, change database schema, or perform production/UnRaid writes during this patch.
- Use synthetic credentials in tests.

---

### Task 1: Supabase credential and header helper

**Files:**
- Create: `apps/collector/src/supabase-auth.ts`
- Create: `apps/collector/tests/supabase-auth.test.ts`

**Interfaces:**
- Produces: `isSupportedSupabaseServerKey(key: string): boolean`
- Produces: `buildSupabaseRequestHeaders(key: string, prefer?: string): Record<string, string>`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import {
  buildSupabaseRequestHeaders,
  isSupportedSupabaseServerKey,
} from "../src/supabase-auth.js";

describe("Supabase server credentials", () => {
  it("uses a current secret key only as an API key", () => {
    expect(buildSupabaseRequestHeaders("sb_secret_test-value")).toEqual({
      apikey: "sb_secret_test-value",
      "content-type": "application/json",
    });
  });

  it("preserves bearer authorization for a legacy service_role JWT", () => {
    const key = "header.payload.signature";
    expect(buildSupabaseRequestHeaders(key, "return=representation")).toEqual({
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      prefer: "return=representation",
    });
  });

  it.each([
    ["sb_secret_test-value", true],
    ["header.payload.signature", true],
    ["sb_publishable_test-value", false],
    ["sbp_test-value", false],
    ["not-a-server-key", false],
  ])("classifies %s as supported=%s", (key, supported) => {
    expect(isSupportedSupabaseServerKey(key)).toBe(supported);
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm --filter @cwl/collector test -- supabase-auth.test.ts`

Expected: FAIL because `../src/supabase-auth.js` does not exist.

- [ ] **Step 3: Implement the pure helper**

```ts
const CURRENT_SECRET_PREFIX = "sb_secret_";

function isLegacyJwt(key: string): boolean {
  const segments = key.split(".");
  return segments.length === 3 && segments.every(Boolean);
}

export function isSupportedSupabaseServerKey(key: string): boolean {
  return (
    (key.startsWith(CURRENT_SECRET_PREFIX) && key.length > CURRENT_SECRET_PREFIX.length)
    || isLegacyJwt(key)
  );
}

export function buildSupabaseRequestHeaders(
  key: string,
  prefer?: string,
): Record<string, string> {
  return {
    apikey: key,
    ...(key.startsWith(CURRENT_SECRET_PREFIX) ? {} : { authorization: `Bearer ${key}` }),
    "content-type": "application/json",
    ...(prefer ? { prefer } : {}),
  };
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `pnpm --filter @cwl/collector test -- supabase-auth.test.ts`

Expected: the new test file passes with no warnings.

- [ ] **Step 5: Commit Task 1**

```sh
git add apps/collector/src/supabase-auth.ts apps/collector/tests/supabase-auth.test.ts
git commit -m "feat: support current Supabase secret headers"
```

---

### Task 2: Reject incorrect collector credentials at startup

**Files:**
- Modify: `apps/collector/src/config.ts`
- Modify: `apps/collector/tests/config.test.ts`

**Interfaces:**
- Consumes: `isSupportedSupabaseServerKey(key: string): boolean`
- Produces: `loadConfig(...)` rejects non-server Supabase credentials without revealing their value.

- [ ] **Step 1: Update valid test fixtures and add failing validation tests**

Add a reusable valid environment fixture using a synthetic current server secret:

```ts
const validEnvironment = {
  CLASH_API_TOKEN: "fake-token",
  CLAN_TAG: "#PQLG",
  SUPABASE_URL: "https://example.invalid",
  SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test-value",
  TZ: "UTC",
};
```

Replace repeated valid values with `...validEnvironment`, then add:

```ts
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
```

- [ ] **Step 2: Run the config tests and verify RED**

Run: `pnpm --filter @cwl/collector test -- config.test.ts`

Expected: FAIL because unsupported values are still accepted.

- [ ] **Step 3: Add startup validation**

Import the helper:

```ts
import { isSupportedSupabaseServerKey } from "./supabase-auth.js";
```

Validate once after required values are present:

```ts
const supabaseServiceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY!.trim();
if (!isSupportedSupabaseServerKey(supabaseServiceRoleKey)) {
  throw new Error(
    "SUPABASE_SERVICE_ROLE_KEY must be a Supabase sb_secret key or legacy service_role JWT",
  );
}
```

Return `supabaseServiceRoleKey` instead of rereading the environment value.

- [ ] **Step 4: Run the config tests and collector suite**

Run: `pnpm --filter @cwl/collector test -- config.test.ts`

Expected: config tests pass.

Run: `pnpm --filter @cwl/collector test`

Expected: all collector tests pass.

- [ ] **Step 5: Commit Task 2**

```sh
git add apps/collector/src/config.ts apps/collector/tests/config.test.ts
git commit -m "fix: validate Supabase server credentials"
```

---

### Task 3: Integrate headers, document the production value, and verify

**Files:**
- Modify: `apps/collector/src/main.ts`
- Modify: `deploy/unraid/collector.env.example`
- Modify: `docs/runbooks/supabase.md`
- Modify: `docs/implementation-progress.md`

**Interfaces:**
- Consumes: `buildSupabaseRequestHeaders(key: string, prefer?: string): Record<string, string>`
- Produces: every collector REST/RPC request uses the correct headers for its validated key type.

- [ ] **Step 1: Integrate the tested helper**

Import the helper in `main.ts`:

```ts
import { buildSupabaseRequestHeaders } from "./supabase-auth.js";
```

Replace the inline headers object with:

```ts
headers: buildSupabaseRequestHeaders(this.key, options.prefer),
```

- [ ] **Step 2: Clarify deployment documentation**

Change the example to:

```dotenv
SUPABASE_SERVICE_ROLE_KEY=replace-with-supabase-server-key
```

Update the Supabase runbook to state that the current key is supported, preferred, and placed in the compatibility-named variable. Record the completed compatibility verification in `docs/implementation-progress.md` without claiming UnRaid deployment is complete.

- [ ] **Step 3: Run fresh full verification**

Run: `pnpm test`

Expected: all workspace and shell regression tests pass.

Run: `pnpm typecheck`

Expected: all five workspace packages pass.

Run: `pnpm build`

Expected: all five workspace packages build.

Run: `git diff --check`

Expected: no output and exit code 0.

- [ ] **Step 4: Commit Task 3**

```sh
git add apps/collector/src/main.ts deploy/unraid/collector.env.example docs/runbooks/supabase.md docs/implementation-progress.md
git commit -m "docs: finalize Supabase secret compatibility"
```

- [ ] **Step 5: Stop before remote writes**

Report the sanitized local and read-only connectivity results. Request explicit authorization before copying files, images, or configuration to UnRaid or changing production state.
