import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { CwlMemberRole, CwlReviewMember } from "../data/operations.js";
import { CwlReviewPage, rankReviewMembers, seasonRecord } from "./cwl-review.js";

function member(overrides: Partial<CwlReviewMember> & { name: string }): CwlReviewMember {
  return {
    playerTag: `#${overrides.name.toUpperCase()}`,
    townHallLevel: 16,
    role: "member" as CwlMemberRole,
    days: [],
    unloggedWarDays: 0,
    ...overrides,
  };
}

function day(warDay: number, { inLineup = true, assigned = 1, completed = 1, stars = 3 } = {}) {
  return { warDay, inLineup, assignedAttacks: assigned, completedAttacks: completed, stars };
}

describe("seasonRecord", () => {
  /* A war day that never reached `warEnded` is absent from the assignment record
     entirely, so it contributes no stars AND no missed attack. The loader hands
     back logged days only; a day the member sat out is present but not in the
     lineup, and must not be counted as a war they joined. */
  it("counts only the days the member was in the lineup", () => {
    const record = seasonRecord(member({
      name: "Ashfall",
      days: [day(1), day(2, { inLineup: false, assigned: 0, completed: 0, stars: 0 }), day(3, { stars: 2 })],
    }));

    expect(record.warsParticipated).toBe(2);
    expect(record.stars).toBe(5);
    expect(record.starsPerWar).toBeCloseTo(2.5);
  });

  it("derives missed attacks from the assignment gap", () => {
    const record = seasonRecord(member({
      name: "Quillon",
      days: [day(1, { assigned: 1, completed: 0, stars: 0 }), day(2, { assigned: 1, completed: 1, stars: 3 })],
    }));

    expect(record.missedAttacks).toBe(1);
    expect(record.completedAttacks).toBe(1);
    expect(record.assignedAttacks).toBe(2);
  });

  /* Eight stars is ADR 0001's threshold and a rank boundary, not a bonus cutoff:
     the game grants a league-dependent number of bonuses and nothing in the
     schema knows it. */
  it("marks eight or more stars as secured", () => {
    expect(seasonRecord(member({ name: "A", days: [day(1, { stars: 8 })] })).secured).toBe(true);
    expect(seasonRecord(member({ name: "B", days: [day(1, { stars: 7 })] })).secured).toBe(false);
  });

  it("reports no stars-per-war for a member who joined no logged war", () => {
    expect(seasonRecord(member({ name: "C" })).starsPerWar).toBeNull();
  });
});

describe("rankReviewMembers", () => {
  /* ADR 0001's order and nothing else. Rating never sorts this list — it is not
     a lineup, and ranking by strength floats the already-secured members to the
     top, which is backwards for a page whose foot is the follow-up
     conversation. */
  it("puts secured members above everyone, then orders by total stars", () => {
    const ranked = rankReviewMembers([
      member({ name: "Thin", days: [day(1, { stars: 3 })] }),
      member({ name: "Secured", days: [day(1, { stars: 3 }), day(2, { stars: 3 }), day(3, { stars: 3 })] }),
      member({ name: "Middle", days: [day(1, { stars: 3 }), day(2, { stars: 3 })] }),
    ]);

    expect(ranked.map((entry) => entry.member.name)).toEqual(["Secured", "Middle", "Thin"]);
    expect(ranked.map((entry) => entry.rank)).toEqual([1, 2, 3]);
  });

  /* Stars per war breaks a stars tie, because three stars from one war and three
     from seven are different facts and the ranking's own terms say so. */
  it("breaks a stars tie on stars per war, then on wars joined", () => {
    const ranked = rankReviewMembers([
      member({ name: "Spread", days: [day(1, { stars: 2 }), day(2, { stars: 2 }), day(3, { stars: 2 })] }),
      member({ name: "Efficient", days: [day(1, { stars: 3 }), day(2, { stars: 3 })] }),
    ]);

    expect(ranked.map((entry) => entry.member.name)).toEqual(["Efficient", "Spread"]);
  });

  it("falls back to role and then to name", () => {
    const ranked = rankReviewMembers([
      member({ name: "Zed", role: "member" }),
      member({ name: "Ada", role: "member" }),
      member({ name: "Nia", role: "elder" }),
    ]);

    expect(ranked.map((entry) => entry.member.name)).toEqual(["Nia", "Ada", "Zed"]);
  });

  /* The ranking is continuous across the two groups — the numbers do not restart
     below the threshold, because the groups are a boundary drawn on one list. */
  it("numbers continuously across the eight-star boundary", () => {
    const ranked = rankReviewMembers([
      member({ name: "Below", days: [day(1, { stars: 1 })] }),
      member({ name: "Above", days: [day(1, { stars: 9 })] }),
    ]);

    expect(ranked.find((entry) => entry.member.name === "Below")?.rank).toBe(2);
  });
});

/* ------------------------------------------------------------------------- */

const SEASON_ROWS = [{ clan_tag: "#CLAN", season_id: "2026-08", war_size: 15, bonuses_administered_at: null }];
const MEMBER_ROWS = [
  { player_tag: "#ONE", name: "Ashfall", town_hall_level: 16 },
  { player_tag: "#TWO", name: "Quillon", town_hall_level: 15 },
];
const WAR_ROWS = [
  { war_tag: "#W1", war_day: 1, state: "warEnded" },
  { war_tag: "#W2", war_day: 2, state: "warEnded" },
];
const ASSIGNMENT_ROWS = [
  { war_day: 1, player_tag: "#ONE", assigned_attacks: 1, completed_assigned_attacks: 1 },
  { war_day: 2, player_tag: "#ONE", assigned_attacks: 1, completed_assigned_attacks: 1 },
  { war_day: 1, player_tag: "#TWO", assigned_attacks: 1, completed_assigned_attacks: 0 },
];
const ATTACK_ROWS = [
  { war_tag: "#W1", attacker_tag: "#ONE", stars: 3 },
  { war_tag: "#W2", attacker_tag: "#ONE", stars: 3 },
  { war_tag: "#W2", attacker_tag: "#ONE", stars: 3 },
];

/* One chainable stub for every table this surface reads. The Supabase builder is
 * fluent and terminal in several ways, so the stub resolves as a thenable and
 * also answers `maybeSingle` — the same shape the other surfaces' tests use. */
function reviewClient(overrides: Record<string, unknown[]> = {}) {
  const tables: Record<string, unknown[]> = {
    cwl_seasons: SEASON_ROWS,
    cwl_members: MEMBER_ROWS,
    member_roster_overview: [{ player_tag: "#ONE", role: "admin" }],
    cwl_wars: WAR_ROWS,
    cwl_completed_missed_attacks: ASSIGNMENT_ROWS,
    cwl_attacks: ATTACK_ROWS,
    cwl_war_members: [],
    collection_runs: [{ status: "healthy", last_fresh_at: "2026-08-20T06:00:00Z" }],
    ...overrides,
  };
  const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
  const from = vi.fn((table: string) => {
    const data = tables[table] ?? [];
    const builder: Record<string, unknown> = {
      then: (resolve: (value: { data: unknown; error: null }) => unknown) => resolve({ data, error: null }),
      maybeSingle: () => Promise.resolve({ data: data[0] ?? null, error: null }),
      single: () => Promise.resolve({ data: data[0] ?? null, error: null }),
    };
    for (const method of ["select", "eq", "in", "order", "limit"]) builder[method] = () => builder;
    return builder;
  });
  return { from, rpc };
}

/* The run the collector writes between seasons, with its attempts embedded the
   way the loader now asks for them. Everything succeeded except the league
   group, which does not exist until the next CWL starts. */
const IDLE_CWL_RUN = {
  status: "partial",
  last_fresh_at: "2026-08-20T06:00:00Z",
  collection_attempts: [
    { endpoint: "clan", status: "healthy", http_status: 200, error_category: null, started_at: "2026-08-20T06:00:00Z", finished_at: "2026-08-20T06:00:10Z" },
    { endpoint: "members", status: "healthy", http_status: 200, error_category: null, started_at: "2026-08-20T06:00:10Z", finished_at: "2026-08-20T06:00:20Z" },
    { endpoint: "league_group", status: "failed", http_status: 404, error_category: "not_found", started_at: "2026-08-20T06:00:20Z", finished_at: "2026-08-20T06:00:21Z" },
  ],
};

describe("CwlReviewPage", () => {
  it("ranks the season into the two eight-star groups", async () => {
    render(<CwlReviewPage client={reviewClient()} clanTag="#CLAN" phase="review" onPhase={vi.fn()} onSeason={vi.fn()} lineupDayLabel="Day 7" />);

    expect(await screen.findByRole("heading", { name: /Eight or more stars/ })).toBeVisible();
    expect(screen.getByRole("heading", { name: /Below eight stars/ })).toBeVisible();
    expect(screen.getByRole("button", { name: /Ashfall/ })).toBeVisible();
  });

  /* Rows mark the exception. A missed attack is the follow-up decision's own
     evidence, so it is one of the only two things the meta line ever carries
     beyond the role. */
  it("marks a missed attack on the row and counts it in the strip", async () => {
    render(<CwlReviewPage client={reviewClient()} clanTag="#CLAN" phase="review" onPhase={vi.fn()} onSeason={vi.fn()} lineupDayLabel="Day 7" />);

    expect(await screen.findByText("1 attack missed")).toBeVisible();
    expect(screen.getByText("Missed attacks").previousSibling).toHaveTextContent("1");
  });

  /* One fact is recorded, and it is recorded from the menu that owns the season
     — a status is read in the header, an action is taken from the overflow, the
     same way the lineup carries Lock day. */
  it("records the bonus handout from the season menu", async () => {
    const user = userEvent.setup();
    const client = reviewClient();
    client.rpc.mockResolvedValue({
      data: { clanTag: "#CLAN", seasonId: "2026-08", bonusesAdministeredAt: "2026-08-20T10:00:00Z" },
      error: null,
    });
    render(<CwlReviewPage client={client} clanTag="#CLAN" phase="review" onPhase={vi.fn()} onSeason={vi.fn()} lineupDayLabel="Day 7" />);

    await user.click(await screen.findByRole("button", { name: "Season options" }));
    await user.click(screen.getByRole("menuitem", { name: "Mark bonuses administered" }));

    expect(client.rpc).toHaveBeenCalledWith("set_cwl_bonuses_administered", {
      requested_clan_tag: "#CLAN", requested_season_id: "2026-08", administered: true,
    });
    expect(await screen.findByText("Bonuses administered")).toBeVisible();
  });

  /* The coverage caveat is scoped to the season, not to the row: a war day that
     never ended is missing for all fifteen members who were in it, so marking
     the row fires on most of the roster and distinguishes nobody. */
  it("states incomplete coverage in the eyebrow", async () => {
    const client = reviewClient({ cwl_wars: [...WAR_ROWS, { war_tag: "#W3", war_day: 3, state: "inWar" }] });
    render(<CwlReviewPage client={client} clanTag="#CLAN" phase="review" onPhase={vi.fn()} onSeason={vi.fn()} lineupDayLabel="Day 7" />);

    expect(await screen.findByText(/2 of 7 war days logged/)).toBeVisible();
  });

  /* The denominator is the season's seven days, not a count of the `cwl_wars`
     rows. A war day nobody collected leaves no row at all, so counting rows
     would make logged equal total and the caveat would go quiet on exactly the
     season it exists to warn about. */
  it("counts uncollected war days against the season's own length", async () => {
    render(<CwlReviewPage client={reviewClient()} clanTag="#CLAN" phase="review" onPhase={vi.fn()} onSeason={vi.fn()} lineupDayLabel="Day 7" />);

    expect(await screen.findByText(/2 of 7 war days logged/)).toBeVisible();
  });

  it("says nothing about coverage once every war day is logged", async () => {
    const client = reviewClient({
      cwl_wars: [1, 2, 3, 4, 5, 6, 7].map((warDay) => ({ war_tag: `#W${warDay}`, war_day: warDay, state: "warEnded" })),
    });
    render(<CwlReviewPage client={client} clanTag="#CLAN" phase="review" onPhase={vi.fn()} onSeason={vi.fn()} lineupDayLabel="Day 7" />);

    expect(await screen.findByRole("heading", { name: /Below eight stars/ })).toBeVisible();
    expect(screen.queryByText(/war days logged/)).not.toBeInTheDocument();
  });

  /* #56. The three tests below are the whole of what the season parameter has to
     be true for: the menu reaches a previous season, the surface says which
     season it is showing, and a season the clan never collected is a bad link
     rather than an error screen. */
  /* The API's own date-shaped ids (#91), because these tests assert on what the
     surface RENDERS from them. */
  const TWO_SEASONS = [
    { clan_tag: "#CLAN", season_id: "2026-08-01", war_size: 15, bonuses_administered_at: null },
    { clan_tag: "#CLAN", season_id: "2026-07-01", war_size: 15, bonuses_administered_at: "2026-07-20T10:00:00Z" },
  ];

  it("opens an earlier season's review from the menu", async () => {
    const user = userEvent.setup();
    const onSeason = vi.fn();
    render(<CwlReviewPage client={reviewClient({ cwl_seasons: TWO_SEASONS })} clanTag="#CLAN" phase="review" onPhase={vi.fn()} onSeason={onSeason} lineupDayLabel="Day 7" />);

    await user.click(await screen.findByRole("button", { name: "Season options" }));
    await user.click(screen.getByRole("menuitem", { name: "July 2026" }));

    expect(onSeason).toHaveBeenCalledWith("2026-07-01");
  });

  /* The season id is a month, so `2026-07` on screen in July is indistinguishable
     from the live season unless the surface says otherwise. */
  it("states in the eyebrow that a previous season is not the current one", async () => {
    render(<CwlReviewPage client={reviewClient({ cwl_seasons: TWO_SEASONS })} clanTag="#CLAN" seasonId="2026-07-01" phase="review" onPhase={vi.fn()} onSeason={vi.fn()} lineupDayLabel="Day 7" />);

    expect(await screen.findByText(/July 2026 · Previous season/)).toBeVisible();
  });

  it("says nothing about a previous season when showing the current one", async () => {
    render(<CwlReviewPage client={reviewClient({ cwl_seasons: TWO_SEASONS })} clanTag="#CLAN" phase="review" onPhase={vi.fn()} onSeason={vi.fn()} lineupDayLabel="Day 7" />);

    expect(await screen.findByText(/August 2026/)).toBeVisible();
    expect(screen.queryByText(/Previous season/)).not.toBeInTheDocument();
  });

  /* The default is always a correct answer, which is why an unknown season falls
     back to the current one instead of failing — the same reasoning that makes
     `phaseFromHash` ignore a parameter that does not name a phase. */
  it("falls back to the current season when the link names one the clan never had", async () => {
    render(<CwlReviewPage client={reviewClient({ cwl_seasons: TWO_SEASONS })} clanTag="#CLAN" seasonId="1999-01" phase="review" onPhase={vi.fn()} onSeason={vi.fn()} lineupDayLabel="Day 7" />);

    expect(await screen.findByText(/August 2026/)).toBeVisible();
    expect(screen.queryByText(/Previous season/)).not.toBeInTheDocument();
  });

  it("leaves the phase through the strip", async () => {
    const user = userEvent.setup();
    const onPhase = vi.fn();
    render(<CwlReviewPage client={reviewClient()} clanTag="#CLAN" phase="review" onPhase={onPhase} onSeason={vi.fn()} lineupDayLabel="Day 7" />);

    await user.click(await screen.findByRole("button", { name: /Lineup/ }));

    expect(onPhase).toHaveBeenCalledWith("lineup");
  });

  it("does not call the season record stale when only the league group was absent", async () => {
    render(<CwlReviewPage client={reviewClient({ collection_runs: [IDLE_CWL_RUN] })} clanTag="#CLAN" phase="review" onPhase={vi.fn()} onSeason={vi.fn()} lineupDayLabel="Day 7" />);

    expect(await screen.findByRole("heading", { name: /Eight or more stars/ })).toBeVisible();
    expect(screen.queryByText("Collection data is stale")).not.toBeInTheDocument();
  });

  /* #74: a null status interpolated into the sentence rendered "reported ." —
     the one word carrying the evidence was the one that was missing. */
  it("states the absence rather than an empty status when no run was read", async () => {
    render(<CwlReviewPage client={reviewClient({ collection_runs: [] })} clanTag="#CLAN" phase="review" onPhase={vi.fn()} onSeason={vi.fn()} lineupDayLabel="Day 7" />);

    expect(await screen.findByText("Collection data is stale")).toBeVisible();
    expect(screen.getByText(/No collection run has been recorded/)).toBeVisible();
    expect(screen.queryByText(/The last collection run reported/)).not.toBeInTheDocument();
  });

  it("still calls the season record stale when a real endpoint failed", async () => {
    const brokenRun = {
      ...IDLE_CWL_RUN,
      collection_attempts: [
        ...IDLE_CWL_RUN.collection_attempts,
        { endpoint: "player", status: "failed", http_status: 200, error_category: "normalization_error", started_at: "2026-08-20T06:00:21Z", finished_at: "2026-08-20T06:00:22Z" },
      ],
    };
    render(<CwlReviewPage client={reviewClient({ collection_runs: [brokenRun] })} clanTag="#CLAN" phase="review" onPhase={vi.fn()} onSeason={vi.fn()} lineupDayLabel="Day 7" />);

    expect(await screen.findByText("Collection data is stale")).toBeVisible();
  });
});
