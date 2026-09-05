import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { collectOnce } from "../../apps/collector/src/collect.js";
import { normalizeSnapshot } from "../../apps/collector/src/normalize.js";
import type { RawSnapshotStore, SaveSnapshotInput } from "../../apps/collector/src/raw-snapshots.js";
import { MemoryRepository } from "../../apps/collector/tests/normalization-fixture.js";
import type { RawSnapshot } from "../../packages/database/src/repository.js";

const clanTag = "#ACCEPT";
const seasonId = "2099-07";
const currentWarTag = "#WAR3";
const fixtureStorageKey = "e2e:cwl-acceptance-fixture";

interface AcceptanceFixtureData extends Record<string, unknown> {
  member_availability: Array<{ player_tag: string; status: string; [key: string]: unknown }>;
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
  /* A war snapshot CANNOT name its own season or war day: the payload carries
     neither, so both come from the league group that listed the tag, and
     `normalizeWar` refuses a war it cannot place rather than inventing a day.
     `collectOnce` passes that context per capture; re-normalizing the stored
     snapshots here means rebuilding it, from the same round order the group
     payload above defines. */
  const warDayByTag = new Map(groupPayload.rounds.flatMap((round, index) => round.warTags.map((tag) => [tag, index + 1] as const)));
  for (const snapshot of canonicalSnapshots) {
    await normalizeSnapshot(repository, snapshot, {
      clanTag,
      collectionRunId: "acceptance-run",
      seasonId,
      ...(warDayByTag.has(snapshot.requestIdentity) ? { warDay: warDayByTag.get(snapshot.requestIdentity)! } : {}),
    });
  }
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
    /* EVERY WAR DAY, WITH ITS STATE. Wave 3 made `cwl_wars` a list in the default
       fixture because the phase marker reads every day's state, and left this
       one a single stateless row — so the workspace could find no war in
       preparation or in war, fell back to day 1, and this run drove an empty
       day-1 lineup while asserting against the day-3 war above. */
    cwl_wars: [1, 2, 3].map((warDay) => ({
      war_tag: `#WAR${warDay}`,
      war_day: warDay,
      state: warDay === 3 ? "inWar" : "warEnded",
      preparation_start_time: `2099-07-0${warDay}T00:00:00.000Z`,
      start_time: `2099-07-0${warDay}T01:00:00.000Z`,
      end_time: `2099-07-0${warDay + 1}T01:00:00.000Z`,
      updated_at: `2099-07-0${warDay + 1}T02:00:00.000Z`,
      attacks_per_member: 1,
    })),
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
    /* THE SEEDED PLAN, without which this run cannot reach the swap panel. An
       absent plan makes the stub's RPC invent one, and the invented plan holds
       the default fixture's roster rather than this one's — so every member here
       would be on the bench, and pressing a bench row ADDS a member rather than
       opening the panel that owns availability. The day-3 lineup is what the war
       payload above already asserts the game holds. */
    cwlLineupPlans: {
      "3": {
        clanTag, seasonId: season.seasonId, warDay: 3, revision: 1, isLocked: false,
        lockedAt: null, lockedBy: null, inheritedFromWarDay: null,
        createdAt: "2099-07-03T08:00:00.000Z", createdBy: "e2e-user",
        updatedAt: "2099-07-03T08:00:00.000Z", updatedBy: "e2e-user",
        playerTags: [...currentLineupTags],
      },
    },
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
  return { fixture };
}

async function expectNoAccessibilityViolations(page: Page) {
  const scan = await new AxeBuilder({ page }).analyze();
  expect(scan.violations, JSON.stringify(scan.violations, null, 2)).toEqual([]);
}

test("runs the fixture through collection, normalization, availability, and review", async ({ page }) => {
  const { fixture } = await buildAcceptanceFixture();
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  page.on("requestfailed", (request) => failedRequests.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText}`));
  page.on("response", (response) => { if (response.status() >= 400) failedRequests.push(`${response.status()} ${response.url()}`); });
  await page.addInitScript(([key, value]) => {
    if (!window.localStorage.getItem(key)) window.localStorage.setItem(key, JSON.stringify(value));
  }, [fixtureStorageKey, fixture] as const);

  /* The route is `#/cwl` since wave 3, and it is no longer only a lineup — it
     carries the phase (ADR 0002). Availability is edited from the swap panel
     that wave 2 introduced, not from the `menuitemradio` menu this test used to
     open; the recorded mutation is the same one either way, which is what this
     acceptance run is actually asserting. */
  await page.goto("/#/cwl");
  await expect(page.getByRole("navigation", { name: "CWL phase" })).toBeVisible();
  await page.getByRole("button", { name: /Unavailable Member/ }).first().click();
  await page.getByRole("button", { name: "Unavailable", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem("e2e:last-mutation"))).toContain("availability");
  await expectNoAccessibilityViolations(page);

  const savedFixture = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "null"), fixtureStorageKey);
  expect(savedFixture.member_availability).toContainEqual(expect.objectContaining({
    player_tag: "#UNAVAILABLE",
    status: "unavailable",
  }));
  /* THE RECOMMENDATION ENGINE IS RETIRED (ADR 0026). This run used to feed the
     saved fixture back through the ordered-rules strategy and assert its reason
     codes; the rules a leader sees now are the bench ranking and the bonus pills
     on the lineup workspace, which the workflow specs cover. What this run keeps
     is the seam the engine never owned: raw collection, normalization into the
     canonical tables, and the availability write the leader makes on the page. */

  /* The season record the review phase reads is derived from the same fixture,
     so the acceptance run ends where the leader's month actually ends. */
  await page.goto("/#/cwl?phase=review");
  await expect(page.getByRole("heading", { name: "Review" })).toBeVisible();
  await expectNoAccessibilityViolations(page);

  expect(consoleErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
  await expectNoAccessibilityViolations(page);
});
