import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createE2EClient } from "./e2e-client.js";

/* THE STUB'S JOINS ARE THE PART THAT FAILS SILENTLY. A `select()` that drops an
 * embedded resource returns a run with no attempts, which reads as a collection
 * fault rather than as an error — the browser suites would go on passing while
 * the fixture told the surface the opposite of what production would. */
describe("the e2e Supabase stub", () => {
  /* The stub reads `window.localStorage` because the browser it was written for
     has one. Under Node 25 the runtime's own `localStorage` global shadows
     jsdom's and answers none of the Storage methods — the jsdom incompatibility
     the README warns about — so the suite supplies the real API rather than
     depending on which Node happens to be in front. */
  beforeEach(() => {
    const entries = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => { entries.set(key, value); },
      removeItem: (key: string) => { entries.delete(key); },
      clear: () => { entries.clear(); },
      key: (index: number) => [...entries.keys()][index] ?? null,
      get length() { return entries.size; },
    });
  });

  afterEach(() => { vi.unstubAllGlobals(); });

  it("embeds a run's attempts the way PostgREST does", async () => {
    const client = createE2EClient();
    const result = await client.from("collection_runs")
      .select("status,last_fresh_at,collection_attempts(endpoint,status,http_status,error_category,started_at,finished_at)")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    expect(result.error).toBeNull();
    expect(result.data.collection_attempts.map((attempt: { endpoint: string }) => attempt.endpoint))
      .toEqual(["clan", "members"]);
  });

  /* The join is by foreign key, not by "every row in the table". */
  it("gives a run only the attempts belonging to it", async () => {
    const client = createE2EClient();
    const result = await client.from("collection_runs")
      .select("status,collection_attempts(endpoint)")
      .maybeSingle();

    expect(result.data.collection_attempts.every((attempt: { run_id: string }) => attempt.run_id === result.data.id)).toBe(true);
  });

  it("leaves a plain column list alone", async () => {
    const client = createE2EClient();
    const result = await client.from("collection_runs").select("status,last_fresh_at").maybeSingle();

    expect(result.data.collection_attempts).toBeUndefined();
    expect(result.data.status).toBe("healthy");
  });
});
