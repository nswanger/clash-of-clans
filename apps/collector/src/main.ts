import { ClashClient } from "./clash-client.js";
import { collectOnce } from "./collect.js";
import { loadConfig } from "./config.js";
import { normalizeSnapshot } from "./normalize.js";
import { evaluateSchema, parseMigrationManifest } from "./schema-guard.js";
import { CollectionScheduler, evaluateHealth } from "./schedule.js";
import { SupabaseCollectorRepository } from "./supabase-collector-repository.js";

declare const process: {
  argv: string[];
  env: Record<string, string | undefined>;
  exitCode?: number;
  on(signal: string, handler: () => void): void;
};

// The manifest is written next to the bundle at image build time (#81). An image
// built without one reports the schema as unknown rather than as behind.
async function readManifest(): Promise<string[] | null> {
  const { readFile } = await import("node:fs/promises");
  try {
    return parseMigrationManifest(
      await readFile(new URL("./migration-manifest.json", import.meta.url), "utf8"),
    );
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") return null;
    throw error;
  }
}

async function main(): Promise<void> {
  const config = loadConfig(process.env);
  const repository = new SupabaseCollectorRepository(config.supabaseUrl, config.supabaseServiceRoleKey);
  const report = config.logLevel === "silent"
    ? () => {}
    : (line: string) => console.error(line);
  const schemaGuard = () => evaluateSchema({
    manifest: readManifest,
    applied: () => repository.appliedMigrationVersions(),
    onUnknown: (reason) => report(`Schema guard inconclusive: ${reason}`),
  });

  if (process.argv.includes("--healthcheck")) {
    const schema = await schemaGuard();
    const result = evaluateHealth({
      ...await repository.healthInput(new Date()),
      missingMigrations: schema.missing,
      activeCwlIntervalMs: config.activeCwlIntervalMs,
      idleIntervalMs: config.idleIntervalMs,
    });
    console.log(JSON.stringify({
      status: result.status,
      // Migration versions are filenames already public in this repository, and the
      // operator needs to know which ones to apply for the state to be actionable.
      ...(schema.missing.length > 0 ? { missingMigrations: schema.missing } : {}),
    }));
    process.exitCode = result.exitCode;
    return;
  }

  const client = new ClashClient({ token: config.clashApiToken });
  const scheduler = new CollectionScheduler({
    lease: repository,
    recordNextRun: (runId, nextRunAt) => repository.recordNextRun(runId, nextRunAt),
    // Checked per run, not once at startup, so applying the missing migration restores
    // normalization on the next collection instead of needing the container recreated.
    collect: async (signal) => {
      const schema = await schemaGuard();
      const degraded = schema.missing.length > 0;
      if (degraded) {
        report(
          `Schema behind: skipping normalized writes. `
          + `Raw snapshots are still being captured. Apply ${schema.missing.join(", ")}.`,
        );
      }
      return collectOnce({
        client,
        store: repository,
        clanTag: config.clanTag,
        // Omitted while degraded: collectOnce still captures raw snapshots, which are
        // the part that cannot be backfilled, and writes nothing canonical.
        ...(degraded ? {} : {
          normalize: (snapshot, context) => normalizeSnapshot(repository, snapshot, context),
        }),
        signal,
      });
    },
    activeCwlIntervalMs: config.activeCwlIntervalMs,
    idleIntervalMs: config.idleIntervalMs,
    regularWarIntervalMs: config.regularWarIntervalMs,
    ...(config.logLevel === "silent" ? {} : {
      onError: (error: unknown) => report(error instanceof Error ? error.message : "Collector failed"),
    }),
  });
  const shutdown = () => { void scheduler.stop(); };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
  await scheduler.start();
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Collector failed to start");
  process.exitCode = 1;
});
