import { ClashApiError, type ClashClient } from "./clash-client.js";
import { fingerprintJson, type CollectionStatus, type RawSnapshotStore } from "./raw-snapshots.js";

type Endpoint = "clan" | "members" | "player" | "league_group" | "league_war";

export interface CollectionSummary {
  runId: string;
  successfulEndpoints: Endpoint[];
  failedEndpoints: Endpoint[];
  errorCategories: Partial<Record<Endpoint, string>>;
  capturedWarTags: string[];
  lastFreshAt: string | null;
}

export interface CollectDependencies {
  client: Pick<ClashClient, "getClan" | "getMembers" | "getPlayer" | "getLeagueGroup" | "getLeagueWar">;
  store: RawSnapshotStore;
  clanTag: string;
  now?: () => Date;
}

export async function collectOnce(dependencies: CollectDependencies): Promise<CollectionSummary> {
  const now = dependencies.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const runId = await dependencies.store.createRun({ startedAt });
  const successfulEndpoints: Endpoint[] = [];
  const failedEndpoints: Endpoint[] = [];
  const errorCategories: Partial<Record<Endpoint, string>> = {};
  const capturedWarTags: string[] = [];
  let lastFreshAt: string | null = null;

  async function capture<T>(
    endpoint: Endpoint,
    requestIdentity: string,
    request: () => Promise<T>,
  ): Promise<T | undefined> {
    const attemptId = await dependencies.store.createAttempt({
      runId,
      endpoint,
      requestIdentity,
      startedAt: now().toISOString(),
    });
    try {
      const responseBody = await request();
      const collectedAt = now().toISOString();
      await dependencies.store.saveSnapshot({
        collectionAttemptId: attemptId,
        endpoint,
        requestIdentity,
        collectedAt,
        httpStatus: 200,
        contentSha256: await fingerprintJson(responseBody),
        responseBody,
      });
      await dependencies.store.finishAttempt({
        attemptId,
        status: "healthy",
        httpStatus: 200,
        finishedAt: now().toISOString(),
      });
      successfulEndpoints.push(endpoint);
      lastFreshAt = collectedAt;
      return responseBody;
    } catch (error) {
      const category = error instanceof ClashApiError ? error.code : "error";
      const httpStatus = error instanceof ClashApiError ? error.httpStatus : undefined;
      if (error instanceof ClashApiError
        && error.responseBody !== undefined
        && httpStatus !== undefined) {
        await dependencies.store.saveSnapshot({
          collectionAttemptId: attemptId,
          endpoint,
          requestIdentity,
          collectedAt: now().toISOString(),
          httpStatus,
          contentSha256: await fingerprintJson(error.responseBody),
          responseBody: error.responseBody,
        });
      }
      failedEndpoints.push(endpoint);
      errorCategories[endpoint] = category;
      await dependencies.store.finishAttempt({
        attemptId,
        status: category === "invalid_ip" ? "invalid_ip" : "error",
        ...(httpStatus === undefined ? {} : { httpStatus }),
        finishedAt: now().toISOString(),
        errorCategory: category,
      });
      return undefined;
    }
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
    const warTags = leagueGroup.rounds.flatMap((round) => round.warTags)
      .filter((tag, index, tags) => tag !== "#0" && tags.indexOf(tag) === index);
    capturedWarTags.push(...warTags);
    for (const warTag of warTags) {
      await capture("league_war", warTag, () => dependencies.client.getLeagueWar(warTag));
    }
  }

  const status = determineStatus(successfulEndpoints, failedEndpoints, errorCategories);
  await dependencies.store.finishRun({
    runId,
    status,
    finishedAt: now().toISOString(),
    lastFreshAt,
    ...(failedEndpoints.length === 0 ? {} : { errorMessage: "One or more Clash endpoints failed" }),
  });
  return { runId, successfulEndpoints, failedEndpoints, errorCategories, capturedWarTags, lastFreshAt };
}

function determineStatus(
  successes: Endpoint[],
  failures: Endpoint[],
  categories: Partial<Record<Endpoint, string>>,
): CollectionStatus {
  if (failures.length === 0) return "healthy";
  if (successes.length > 0) return "partial";
  if (Object.values(categories).some((category) => category === "invalid_ip")) return "invalid_ip";
  return "error";
}
