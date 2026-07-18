import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { recommendationContextSchema } from "@cwl/domain";
import { OrderedRulesStrategy } from "@cwl/recommendations";
import { collectOnce } from "../../apps/collector/src/collect.js";
import { normalizeSnapshot } from "../../apps/collector/src/normalize.js";
import type { RawSnapshotStore, SaveSnapshotInput } from "../../apps/collector/src/raw-snapshots.js";
import { MemoryRepository } from "../../apps/collector/tests/normalization-fixture.js";
import type { RawSnapshot } from "../../packages/database/src/repository.js";

const clanTag = "#ACCEPT";
const seasonId = "2099-07";
const currentWarTag = "#WAR3";
const recommendationId = "30000000-0000-0000-0000-000000000010";
const fixtureStorageKey = "e2e:cwl-acceptance-fixture";

interface AcceptanceFixtureData extends Record<string, unknown> {
  member_availability: Array<{ player_tag: string; status: string; [key: string]: unknown }>;
  recommendations?: unknown;
}

const roster = [
  ["#UNAVAILABLE", "Unavailable Member", 16],
  ["#UNKNOWN", "Unknown Contact", 16],
  ...Array.from({ length: 8 }, (_, index) => [`#CORE${index + 3}`, `Core ${index + 3}`, 16] as const),
  ["#MISS", "Missed Attacker", 15],
  ["#EIGHT", "Eight Star Rotation", 15],
  ["#GAP", "Coverage Gap Member", 15],
  ["#ROT14", "Reliable Rotation", 15],
  ["#EIGHT2", "Second Eight Star", 15],
  ["#SUBA", "Experienced Substitute A", 15],
  ["#SUBB", "Experienced Substitute B", 15],
  ["#SUBC", "Experienced Substitute C", 15],
  ["#SUBD", "Experienced Substitute D", 15],
  ["#NEW", "Limited Confidence Substitute", 15],
] as const;

const currentLineupTags = [
  "#UNAVAILABLE", "#UNKNOWN", ...Array.from({ length: 8 }, (_, index) => `#CORE${index + 3}`),
  "#MISS", "#EIGHT", "#GAP", "#ROT14", "#EIGHT2",
];
const priorWarTags = [
  ...Array.from({ length: 8 }, (_, index) => `#CORE${index + 3}`),
  "#MISS", "#EIGHT", "#EIGHT2", "#SUBA", "#SUBB", "#SUBC", "#SUBD",
];

class AcceptanceSnapshotStore implements RawSnapshotStore {
  readonly snapshots: RawSnapshot[] = [];
  private runSequence = 0;
  private attemptSequence = 0;

  async createRun() {
    this.runSequence += 1;
    return `run-${this.runSequence}`;
  }

  async createAttempt() {
    this.attemptSequence += 1;
    return `attempt-${this.attemptSequence}`;
  }

  async saveSnapshot(input: SaveSnapshotInput) {
    this.snapshots.push({
      id: `snapshot-${this.snapshots.length + 1}`,
      endpoint: input.endpoint,
      requestIdentity: input.requestIdentity,
      collectedAt: input.collectedAt,
      responseBody: input.responseBody,
    });
  }

  async finishAttempt() {}
  async finishRun() {}
}

function apiMember(playerTag: string) {
  const member = roster.find(([tag]) => tag === playerTag);
  if (!member) throw new Error(`Unknown fixture member ${playerTag}`);
  return { tag: member[0], name: member[1], townHallLevel: member[2] };
}

function warMember(playerTag: string, mapPosition: number, warNumber: number) {
  const member = apiMember(playerTag);
  const missesCurrentAttack = playerTag === "#MISS" && warNumber === 3;
  const eightStarPlayer = playerTag === "#EIGHT" || playerTag === "#EIGHT2";
  const stars = eightStarPlayer ? (warNumber === 3 ? 2 : 3) : 1;
  return {
    ...member,
    mapPosition,
    attacks: missesCurrentAttack ? [] : [{
      defenderTag: `#DEF${warNumber}${mapPosition}`,
      stars,
      destructionPercentage: 75 + mapPosition,
      order: mapPosition,
      duration: 120 + mapPosition,
    }],
  };
}

function warPayload(warNumber: number, playerTags: string[]) {
  return {
    tag: `#WAR${warNumber}`,
    state: warNumber === 3 ? "inWar" : "warEnded",
    teamSize: 15,
    attacksPerMember: 1,
    preparationStartTime: `2099070${warNumber}T000000.000Z`,
    startTime: `2099070${warNumber}T010000.000Z`,
    endTime: `2099070${warNumber + 1}T010000.000Z`,
    clan: { tag: clanTag, members: playerTags.map((tag, index) => warMember(tag, index + 1, warNumber)) },
    opponent: { tag: `#OPP${warNumber}`, members: [] },
  };
}

async function buildAcceptanceFixture() {
  const rawStore = new AcceptanceSnapshotStore();
  const members = roster.map(([tag]) => apiMember(tag));
  const groupPayload = {
    state: "inWar",
    season: seasonId,
    clans: [{ tag: clanTag, name: "Acceptance Clan", members }],
    rounds: [{ warTags: ["#WAR1"] }, { warTags: ["#WAR2"] }, { warTags: [currentWarTag] }],
  };
  const wars = new Map([
    ["#WAR1", warPayload(1, priorWarTags)],
    ["#WAR2", warPayload(2, priorWarTags)],
    [currentWarTag, warPayload(3, currentLineupTags)],
  ]);
  const client = {
    getClan: async () => ({ tag: clanTag, name: "Acceptance Clan", memberList: members }),
    getMembers: async () => ({ items: members }),
    getPlayer: async (playerTag: string) => apiMember(playerTag),
    getLeagueGroup: async () => groupPayload,
    getLeagueWar: async (warTag: string) => {
      const war = wars.get(warTag);
      if (!war) throw new Error(`Unknown fixture war ${warTag}`);
      return war;
    },
  };

  const collection = await collectOnce({
    client,
    store: rawStore,
    clanTag,
    now: () => new Date("2099-07-03T12:00:00.000Z"),
  });
  expect(collection).toMatchObject({
    activeCwl: true,
    failedEndpoints: [],
    capturedWarTags: ["#WAR1", "#WAR2", currentWarTag],
  });
  expect(rawStore.snapshots.filter(({ endpoint }) => endpoint === "league_group")).toHaveLength(1);
  expect(rawStore.snapshots.filter(({ endpoint }) => endpoint === "league_war")).toHaveLength(3);
  expect(rawStore.snapshots.some(({ endpoint }) => endpoint === "player")).toBe(true);

  const repository = new MemoryRepository();
  const canonicalSnapshots = rawStore.snapshots.filter(({ endpoint }) => endpoint === "league_group" || endpoint === "league_war");
  for (const snapshot of canonicalSnapshots) await normalizeSnapshot(repository, snapshot);
  await expect(repository.counts()).resolves.toEqual({ seasons: 1, wars: 3, warMembers: 45, attacks: 44 });
  expect(repository.normalized).toEqual(new Set(canonicalSnapshots.map(({ id }) => id)));

  const season = repository.seasons.get(`${clanTag}:${seasonId}`);
  expect(season).toMatchObject({
    warSize: 15,
    targetCoreSize: 10,
    rotationPositions: 5,
    priorityMode: "balanced",
    eightStarRotationEnabled: true,
  });
  if (!season) throw new Error("Canonical season was not created");

  const availability = new Map(roster.map(([playerTag]) => [playerTag, "available"] as const));
  availability.set("#UNKNOWN", "unknown");
  availability.set("#GAP", "unavailable");
  expect(availability.get("#UNAVAILABLE")).toBe("available");
  expect(availability.get("#UNKNOWN")).toBe("unknown");

  const assignedOpportunities = new Map<string, number>();
  for (const { playerTag, assignedAttacks } of repository.warMembers.values()) {
    assignedOpportunities.set(playerTag, (assignedOpportunities.get(playerTag) ?? 0) + assignedAttacks);
  }
  const completedAssignedAttacks = new Map<string, number>();
  const stars = new Map<string, number>();
  for (const attack of repository.attacks.values()) {
    completedAssignedAttacks.set(attack.attackerTag, (completedAssignedAttacks.get(attack.attackerTag) ?? 0) + 1);
    stars.set(attack.attackerTag, (stars.get(attack.attackerTag) ?? 0) + attack.stars);
  }

  const memberFacts = [...repository.members.values()].map((member) => ({
    playerTag: member.playerTag,
    name: member.name,
    townHallLevel: member.townHallLevel,
    assignedOpportunities: assignedOpportunities.get(member.playerTag) ?? 0,
    completedAssignedAttacks: completedAssignedAttacks.get(member.playerTag) ?? 0,
    stars: stars.get(member.playerTag) ?? 0,
    eightStarEligible: (stars.get(member.playerTag) ?? 0) >= 8,
  }));
  const generateRecommendation = (fixtureData: AcceptanceFixtureData) => {
    const savedAvailability = new Map(
      fixtureData.member_availability.map((row: { player_tag: string; status: string }) => [row.player_tag, row.status]),
    );
    const context = recommendationContextSchema.parse({
      seasonTag: season.seasonId,
      settings: {
        warSize: season.warSize,
        targetCoreSize: season.targetCoreSize,
        rotationPositions: season.rotationPositions,
        priorityMode: season.priorityMode,
        eightStarRotationEnabled: season.eightStarRotationEnabled,
      },
      members: memberFacts.map((member) => ({
        ...member,
        availability: savedAvailability.get(member.playerTag) ?? "unknown",
      })),
      currentLineup: currentLineupTags.map((playerTag, index) => ({
        playerTag,
        position: index + 1,
        isCore: index < 10,
      })),
      collectionHealth: { status: "healthy", collectedAt: collection.lastFreshAt },
    });
    return { context, recommendation: new OrderedRulesStrategy().recommend(context) };
  };

  const currentWarMembers = [...repository.warMembers.values()].filter(({ warTag }) => warTag === currentWarTag);
  const currentAttacks = [...repository.attacks.values()].filter(({ warTag }) => warTag === currentWarTag);
  const fixture = {
    profiles: { display_name: "Acceptance Leader" },
    cwl_seasons: {
      clan_tag: clanTag,
      season_id: season.seasonId,
      war_size: season.warSize,
      target_core_size: season.targetCoreSize,
      rotation_positions: season.rotationPositions,
      priority_mode: season.priorityMode,
      eight_star_rotation_enabled: season.eightStarRotationEnabled,
    },
    cwl_wars: { war_tag: currentWarTag, war_day: 3, end_time: "2099-07-04T01:00:00.000Z", attacks_per_member: 1 },
    cwl_members: [...repository.members.values()].map((member) => ({
      player_tag: member.playerTag,
      name: member.name,
      town_hall_level: member.townHallLevel,
    })),
    cwl_war_members: currentWarMembers.map((member) => ({
      player_tag: member.playerTag,
      assigned_attacks: member.assignedAttacks,
    })),
    cwl_attacks: currentAttacks.map((attack) => ({ attacker_tag: attack.attackerTag })),
    member_availability: [...availability].map(([playerTag, status]) => ({ player_tag: playerTag, status })),
    cwl_eight_star_eligibility: memberFacts.map((member) => ({
      player_tag: member.playerTag,
      stars: member.stars,
      eight_star_eligible: member.eightStarEligible,
    })),
    collection_attempts: { run_id: collection.runId },
    collection_runs: { status: "healthy", last_fresh_at: collection.lastFreshAt, error_message: null },
    user_roles: [{ user_id: "e2e-user", role: "admin", profiles: { display_name: "Acceptance Leader" } }],
  };
  return { fixture, generateRecommendation };
}

async function expectNoAccessibilityViolations(page: Page) {
  const scan = await new AxeBuilder({ page }).analyze();
  expect(scan.violations, JSON.stringify(scan.violations, null, 2)).toEqual([]);
}

test("runs the fixture through collection, normalization, recommendation, explanation, and leader decisions", async ({ page }) => {
  const { fixture, generateRecommendation } = await buildAcceptanceFixture();
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  page.on("requestfailed", (request) => failedRequests.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText}`));
  page.on("response", (response) => { if (response.status() >= 400) failedRequests.push(`${response.status()} ${response.url()}`); });
  await page.addInitScript(([key, value]) => {
    if (!window.localStorage.getItem(key)) window.localStorage.setItem(key, JSON.stringify(value));
  }, [fixtureStorageKey, fixture] as const);

  await page.goto("/#/availability");
  await expect(page.getByRole("heading", { name: "Availability" })).toBeVisible();
  const unavailableForm = page.getByRole("group", { name: "Unavailable Member" }).locator("..");
  await unavailableForm.getByRole("radio", { name: "Unavailable" }).check();
  await unavailableForm.getByRole("textbox", { name: "Leader note" }).fill("Confirmed unavailable for war day 3");
  await unavailableForm.getByRole("button", { name: "Save availability" }).click();
  await expect(page.getByRole("status")).toContainText("Saved availability for Unavailable Member");
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem("e2e:last-mutation"))).toContain("availability");
  await expectNoAccessibilityViolations(page);

  const savedFixture = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "null"), fixtureStorageKey);
  expect(savedFixture.member_availability).toContainEqual(expect.objectContaining({
    player_tag: "#UNAVAILABLE",
    status: "unavailable",
  }));
  const { recommendation } = generateRecommendation(savedFixture);
  const allReasonCodes = recommendation.changes.flatMap(({ reasons }) => reasons.map(({ code }) => code));
  expect(allReasonCodes).toEqual(expect.arrayContaining([
    "unavailable", "availability_unknown", "missed_attack", "eight_star_rotation", "limited_confidence",
  ]));
  expect(recommendation.contacts).toContainEqual(expect.objectContaining({ playerTag: "#UNKNOWN" }));
  expect(recommendation.coverageGaps).toEqual([expect.objectContaining({ position: 15 })]);
  expect(recommendation.changes).toContainEqual(expect.objectContaining({
    outPlayerTag: "#EIGHT",
    inPlayerTag: "#NEW",
    confidenceNote: expect.stringMatching(/limited confidence/i),
  }));
  expect(recommendation.changes.map(({ inPlayerTag }) => inPlayerTag)).not.toEqual(
    expect.arrayContaining(["#UNAVAILABLE", "#UNKNOWN"]),
  );
  savedFixture.recommendations = { id: recommendationId, output: recommendation };
  await page.evaluate(([key, value]) => window.localStorage.setItem(key, JSON.stringify(value)), [fixtureStorageKey, savedFixture] as const);

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Daily command" })).toBeVisible();
  await expect(page.getByText("Missed Attacker", { exact: true })).toBeVisible();
  await expect(page.getByText("Unavailable Member", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Contact needed" })).toBeVisible();
  await expect(page.getByText(/Unknown Contact.*Availability needs leader confirmation/)).toBeVisible();
  await expect(page.getByText(/No eligible substitute for position 15/)).toBeVisible();
  await expect(page.getByText(/Limited confidence for #NEW/)).toBeVisible();
  await page.getByRole("button", { name: "Why Eight Star Rotation?" }).click();
  await expect(page.getByText(/eight_star_rotation.*limited_confidence/)).toBeVisible();
  await expectNoAccessibilityViolations(page);

  await page.getByRole("button", { name: "Approve changes" }).click();
  await expect(page.getByRole("status")).toContainText("approved");
  const approvedMutation = await page.evaluate(() => JSON.parse(window.localStorage.getItem("e2e:last-mutation") ?? "null"));
  expect(approvedMutation).toMatchObject({
    name: "rpc:record_leader_decision",
    value: { decision_status: "approved", recommendation_id: recommendationId },
  });

  await page.reload();
  await page.getByRole("button", { name: "Edit lineup" }).click();
  await page.getByRole("textbox", { name: "Override note" }).fill("Keep one experienced member for the tougher mirror");
  await page.getByRole("button", { name: "Save override" }).click();
  await expect(page.getByRole("status")).toContainText("Override recorded");
  const overriddenMutation = await page.evaluate(() => JSON.parse(window.localStorage.getItem("e2e:last-mutation") ?? "null"));
  expect(overriddenMutation).toMatchObject({
    name: "rpc:record_leader_decision",
    value: {
      decision_status: "overridden",
      recommendation_id: recommendationId,
      decision_override_note: "Keep one experienced member for the tougher mirror",
    },
  });

  expect(consoleErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
  await expectNoAccessibilityViolations(page);
});
