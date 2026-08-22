import { describe, expect, it } from "vitest";
import { createE2EClient } from "./e2e-client.js";

/* THE STUB'S JOINS ARE THE PART THAT FAILS SILENTLY. A `select()` that drops an
 * embedded resource returns a run with no attempts, which reads as a collection
 * fault rather than as an error — the browser suites would go on passing while
 * the fixture told the surface the opposite of what production would. */
describe("the e2e Supabase stub", () => {
  /* The stub reads `window.localStorage` because the browser it was written for
     has one. This suite used to hand-roll a Storage here because a Node 25
     runtime global shadows jsdom's; `src/test/setup.ts` now repairs that once
     for every suite, so the local stub is gone. */

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
