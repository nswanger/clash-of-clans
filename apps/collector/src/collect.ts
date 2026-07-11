import { ClashApiError, type ClashClient } from "./clash-client.js";
import { fingerprintJson, type CollectionStatus, type RawSnapshotStore } from "./raw-snapshots.js";

type Endpoint = "clan" | "members" | "player" | "league_group" | "league_war";

export interface FinalizationError {
  scope: "attempt" | "run";
  endpoint?: Endpoint;
  message: string;
}

export interface InternalCollectionError {
  endpoint: Endpoint;
  operation: "create_attempt" | "save_snapshot";
  message: string;
}

export interface CollectionSummary {
  runId: string;
  successfulEndpoints: Endpoint[];
  failedEndpoints: Endpoint[];
  errorCategories: Partial<Record<Endpoint, string>>;
  capturedWarTags: string[];
  lastFreshAt: string | null;
  runFinalized: boolean;
  finalizationErrors: FinalizationError[];
  internalErrors: InternalCollectionError[];
  activeCwl: boolean;
}

export interface CollectDependencies {
  client: Pick<ClashClient, "getClan" | "getMembers" | "getPlayer" | "getLeagueGroup" | "getLeagueWar">;
  store: RawSnapshotStore;
  clanTag: string;
  now?: () => Date;
}

export async function collectOnce(dependencies: CollectDependencies): Promise<CollectionSummary> {
  const now = dependencies.now ?? (() => new Date());
  const runId = await dependencies.store.createRun({ startedAt: now().toISOString() });
  const successfulEndpoints: Endpoint[] = [];
  const failedEndpoints: Endpoint[] = [];
  const errorCategories: Partial<Record<Endpoint, string>> = {};
  const capturedWarTags: string[] = [];
  const finalizationErrors: FinalizationError[] = [];
  const internalErrors: InternalCollectionError[] = [];
  let lastFreshAt: string | null = null;
  let activeCwl = false;

  function failEndpoint(endpoint: Endpoint, category: string): void {
    if (!failedEndpoints.includes(endpoint)) failedEndpoints.push(endpoint);
    errorCategories[endpoint] ??= category;
  }

  async function finishAttemptSafely(
    endpoint: Endpoint,
    input: Parameters<RawSnapshotStore["finishAttempt"]>[0],
  ): Promise<boolean> {
    try {
      await dependencies.store.finishAttempt(input);
      return true;
    } catch (error) {
      failEndpoint(endpoint, "storage_error");
      finalizationErrors.push({ scope: "attempt", endpoint, message: errorMessage(error) });
      return false;
    }
  }

  async function capture<T>(
    endpoint: Endpoint,
    requestIdentity: string,
    request: () => Promise<T>,
  ): Promise<T | undefined> {
    let attemptId: string;
    try {
      attemptId = await dependencies.store.createAttempt({
        runId,
        endpoint,
        requestIdentity,
        startedAt: now().toISOString(),
      });
    } catch (error) {
      failEndpoint(endpoint, "storage_error");
      internalErrors.push({ endpoint, operation: "create_attempt", message: errorMessage(error) });
      return undefined;
    }

    let responseBody: T;
    try {
      responseBody = await request();
    } catch (error) {
      const category = error instanceof ClashApiError ? error.code : "internal_error";
      const httpStatus = error instanceof ClashApiError ? error.httpStatus : undefined;
      failEndpoint(endpoint, category);
      if (error instanceof ClashApiError && error.responseBody !== undefined && httpStatus !== undefined) {
        try {
          await dependencies.store.saveSnapshot({
            collectionAttemptId: attemptId,
            endpoint,
            requestIdentity,
            collectedAt: now().toISOString(),
            httpStatus,
            contentSha256: await fingerprintJson(error.responseBody),
            responseBody: error.responseBody,
          });
        } catch (storageError) {
          internalErrors.push({ endpoint, operation: "save_snapshot", message: errorMessage(storageError) });
        }
      }
      await finishAttemptSafely(endpoint, {
        attemptId,
        status: category === "invalid_ip" ? "invalid_ip" : "error",
        ...(httpStatus === undefined ? {} : { httpStatus }),
        finishedAt: now().toISOString(),
        errorCategory: category,
      });
      return undefined;
    }

    const collectedAt = now().toISOString();
    try {
      await dependencies.store.saveSnapshot({
        collectionAttemptId: attemptId,
        endpoint,
        requestIdentity,
        collectedAt,
        httpStatus: 200,
        contentSha256: await fingerprintJson(responseBody),
        responseBody,
      });
    } catch (error) {
      failEndpoint(endpoint, "storage_error");
      internalErrors.push({ endpoint, operation: "save_snapshot", message: errorMessage(error) });
      await finishAttemptSafely(endpoint, {
        attemptId,
        status: "error",
        httpStatus: 200,
        finishedAt: now().toISOString(),
        errorCategory: "storage_error",
      });
      return undefined;
    }

    const finalized = await finishAttemptSafely(endpoint, {
      attemptId,
      status: "healthy",
      httpStatus: 200,
      finishedAt: now().toISOString(),
    });
    if (finalized) {
      successfulEndpoints.push(endpoint);
      lastFreshAt = collectedAt;
    }
    return responseBody;
  }

  await capture("clan", dependencies.clanTag, () => dependencies.client.getClan(dependencies.clanTag));
  const members = await capture(
    "members",
    dependencies.clanTag,
    () => dependencies.client.getMembers(dependencies.clanTag),
  );
  if (members) {
    for (const member of members.items) {
      await capture("player", member.tag, () => dependencies.client.getPlayer(member.tag));
    }
  }
  const leagueGroup = await capture(
    "league_group",
    dependencies.clanTag,
    () => dependencies.client.getLeagueGroup(dependencies.clanTag),
  );
  if (leagueGroup) {
    activeCwl = leagueGroup.state !== "notInWar";
    const warTags = leagueGroup.rounds.flatMap((round) => round.warTags)
      .filter((tag, index, tags) => tag !== "#0" && tags.indexOf(tag) === index);
    capturedWarTags.push(...warTags);
    for (const warTag of warTags) {
      await capture("league_war", warTag, () => dependencies.client.getLeagueWar(warTag));
    }
  }

  const status = determineStatus(successfulEndpoints, failedEndpoints, errorCategories);
  let runFinalized = true;
  try {
    await dependencies.store.finishRun({
      runId,
      status,
      finishedAt: now().toISOString(),
      lastFreshAt,
      ...(failedEndpoints.length === 0 ? {} : { errorMessage: "One or more collection endpoints failed" }),
    });
  } catch (error) {
    runFinalized = false;
    finalizationErrors.push({ scope: "run", message: errorMessage(error) });
  }
  return {
    runId,
    successfulEndpoints,
    failedEndpoints,
    errorCategories,
    capturedWarTags,
    lastFreshAt,
    runFinalized,
    finalizationErrors,
    internalErrors,
    activeCwl,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown internal error";
}

function determineStatus(
  successes: Endpoint[],
  failures: Endpoint[],
  categories: Partial<Record<Endpoint, string>>,
): CollectionStatus {
  if (failures.length === 0) return "healthy";
  if (Object.values(categories).some((category) => category === "invalid_ip")) return "invalid_ip";
  if (successes.length > 0) return "partial";
  return "error";
}
