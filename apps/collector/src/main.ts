import { ClashClient } from "./clash-client.js";
import { collectOnce } from "./collect.js";
import { loadConfig } from "./config.js";
import { normalizeSnapshot } from "./normalize.js";
import { CollectionScheduler, evaluateHealth } from "./schedule.js";
import { SupabaseCollectorRepository } from "./supabase-collector-repository.js";

declare const process: {
  argv: string[];
  env: Record<string, string | undefined>;
  exitCode?: number;
  on(signal: string, handler: () => void): void;
};

async function main(): Promise<void> {
  const config = loadConfig(process.env);
  const repository = new SupabaseCollectorRepository(config.supabaseUrl, config.supabaseServiceRoleKey);
  if (process.argv.includes("--healthcheck")) {
    const result = evaluateHealth({
      ...await repository.healthInput(new Date()),
      activeCwlIntervalMs: config.activeCwlIntervalMs,
      idleIntervalMs: config.idleIntervalMs,
    });
    console.log(JSON.stringify({ status: result.status }));
    process.exitCode = result.exitCode;
    return;
  }

  const client = new ClashClient({ token: config.clashApiToken });
  const scheduler = new CollectionScheduler({
    lease: repository,
    collect: (signal) => collectOnce({
      client,
      store: repository,
      clanTag: config.clanTag,
      normalize: (snapshot) => normalizeSnapshot(repository, snapshot),
      signal,
    }),
    activeCwlIntervalMs: config.activeCwlIntervalMs,
    idleIntervalMs: config.idleIntervalMs,
    ...(config.logLevel === "silent" ? {} : {
      onError: (error: unknown) => console.error(error instanceof Error ? error.message : "Collector failed"),
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
