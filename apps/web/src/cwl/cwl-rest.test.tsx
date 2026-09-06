import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CwlSeasonPhaseSnapshot } from "../data/operations.js";
import { CwlStandDownPage, rankRollCall } from "./cwl-rest.js";

function snapshot(overrides: Partial<CwlSeasonPhaseSnapshot> = {}): CwlSeasonPhaseSnapshot {
  return {
    clanTag: "#CLAN",
    seasonId: "2026-08-01",
    bonusesAdministeredAt: "2026-08-14T18:22:00Z",
    seasonIds: ["2026-08-01", "2026-07-01", "2026-06-01"],
    warDays: [{ warDay: 1, state: "warEnded", endTime: "2026-08-11T23:59:59Z" }],
    ...overrides,
  };
}

/* The roster the roll call is gathered against: the CLAN from the last daily
   pull, not `cwl_members`, which is the CWL signup roster and does not exist for
   a season that has not started. */
const roster = [
  { player_tag: "#MASON", name: "Mason", role: "admin", town_hall_level: 15 },
  { player_tag: "#SAM", name: "Sam", role: "member", town_hall_level: 16 },
];

/* A chainable read/write stub, because the surface now loads two tables and
   writes one. `then` is what resolves it, matching the query builder the app
   actually awaits. */
function client(options: {
  entries?: Array<{ player_tag: string }>;
  members?: Array<{ player_tag: string; name: string; role: string; town_hall_level: number }>;
  onWrite?: (act: string, value: unknown) => void;
} = {}) {
  const entries = options.entries ?? [];
  const members = options.members ?? roster;
  return {
    rpc: vi.fn().mockResolvedValue({ data: { clanTag: "#CLAN", seasonId: "2026-08-01", bonusesAdministeredAt: null }, error: null }),
    auth: { getUser: async () => ({ data: { user: { id: "leader-1" } }, error: null }) },
    from: (table: string) => {
      const rows = table === "member_roster_overview" ? members : entries;
      const query: any = {
        select: () => query,
        eq: () => query,
        order: () => query,
        upsert: async (value: unknown) => { options.onWrite?.("upsert", value); return { error: null }; },
        delete: () => {
          const removal: any = { eq: () => removal, then: (resolve: (v: unknown) => void) => { options.onWrite?.("delete", null); resolve({ error: null }); } };
          return removal;
        },
        then: (resolve: (value: unknown) => void) => resolve({ data: rows, error: null }),
      };
      return query;
    },
  };
}

function standDown(props: {
  client?: any;
  snapshot?: CwlSeasonPhaseSnapshot;
  onPhase?: (next: any) => void;
  onSeason?: (seasonId: string) => void;
} = {}) {
  return <CwlStandDownPage
    client={props.client ?? client()}
    clanTag="#CLAN"
    snapshot={props.snapshot ?? snapshot()}
    phase="resting"
    onPhase={props.onPhase ?? vi.fn()}
    onSeason={props.onSeason ?? vi.fn()}
    lineupDayLabel="Day 1"
  />;
}

/* The whole surface is a function of the clock, so every test here fixes it.
   Fake timers also hold the interval still, which is what makes the tick an
   assertion rather than a race. */
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-22T14:32:32Z"));
});
afterEach(() => vi.useRealTimers());

describe("CwlStandDownPage", () => {
  /* Two lines: what ended, and how long until the next one. The season is named
     as a month because the id is a key everywhere else and a date exactly
     here. */
  it("names the finished season as a month and counts to the next 1st", () => {
    render(standDown());

    expect(screen.getByRole("heading", { level: 1, name: "Stand down" })).toBeVisible();
    expect(screen.getByText("August 2026 is finished.")).toBeVisible();
    expect(screen.getByText("Next CWL starts in")).toBeVisible();
    /* 2026-08-22T14:32:32Z to 2026-09-01T05:00:00Z. */
    expect(screen.getByRole("timer")).toHaveTextContent("9d 14:27:28");
    expect(screen.getByText("1 September · 05:00 UTC")).toBeVisible();
  });

  it("ticks every second", () => {
    render(standDown());

    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.getByRole("timer")).toHaveTextContent("9d 14:27:27");
  });

  /* THE FLOOR. Past zero it stops counting rather than running negative or
     claiming a season is live before one is collected — and the label goes with
     the digits, because "Next CWL starts in" above "CWL starting soon" is the
     page contradicting itself in two lines. */
  it("floors past zero, and drops the label with the digits", () => {
    vi.setSystemTime(new Date("2026-09-01T05:00:01Z"));
    render(standDown());

    expect(screen.getByText("CWL starting soon")).toBeVisible();
    expect(screen.queryByText("Next CWL starts in")).toBeNull();
    expect(screen.queryByRole("timer")).toBeNull();
    expect(screen.queryByText(/UTC/)).toBeNull();
  });

  /* A ticking number is not animation in the strict sense, but it is the same
     instinct: under the opt-out it is a coarse static string and there is no
     interval at all. */
  it("renders a coarse static string under reduced motion", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    render(standDown());

    expect(screen.getByRole("timer")).toHaveTextContent("About 9 days");
    act(() => { vi.advanceTimersByTime(5000); });
    expect(screen.getByRole("timer")).toHaveTextContent("About 9 days");
    vi.unstubAllGlobals();
  });

  /* The strip's sub-label carries the same remainder as the clock, floored the
     same way. The prototype showed "10 days" above "9d" by rounding one of
     them. */
  it("agrees with the phase strip's sub-label to the day", () => {
    render(standDown());

    expect(screen.getByRole("button", { name: /^Stand down/ })).toHaveTextContent("9 days");
  });

  /* Reopening the review clears the administered marker, which is the first rung
     of the phase ladder — so the way back is the mutation plus a phase the URL
     names. */
  it("reopens the review from the season menu", async () => {
    const rpcClient = client();
    const onPhase = vi.fn();
    render(standDown({ client: rpcClient, onPhase }));

    /* `fireEvent` rather than `userEvent` throughout this file: user-event's
       pointer sequence and vitest's fake timers deadlock, and the clock here
       has to be fake for anything else to be assertable. */
    fireEvent.click(screen.getByRole("button", { name: "Season options" }));
    await act(async () => { fireEvent.click(screen.getByRole("menuitem", { name: "Reopen review" })); });

    expect(rpcClient.rpc).toHaveBeenCalledWith("set_cwl_bonuses_administered", {
      requested_clan_tag: "#CLAN", requested_season_id: "2026-08-01", administered: false,
    });
    expect(onPhase).toHaveBeenCalledWith("review");
  });

  /* Off-season is when a leader is most likely to look back, which made this
     surface #56's second consumer. The entries were disabled until the CWL views
     stopped being scoped to the latest season; now each one opens its review. */
  it("opens an earlier season's review from the menu", () => {
    const onSeason = vi.fn();
    render(standDown({ onSeason }));

    fireEvent.click(screen.getByRole("button", { name: "Season options" }));
    const earlier = screen.getByRole("menuitem", { name: "July 2026" });
    expect(earlier).toBeEnabled();

    fireEvent.click(earlier);
    expect(onSeason).toHaveBeenCalledWith("2026-07-01");
  });

  /* The season on screen is where you already are, so it is marked rather than
     offered as a destination. */
  it("marks the season it is standing down from", () => {
    render(standDown());

    fireEvent.click(screen.getByRole("button", { name: "Season options" }));

    expect(screen.getByRole("menuitem", { name: /August 2026/ })).toHaveAttribute("aria-current", "true");
  });
});

/* THE PRE-SEASON ROLL CALL (#96).
 *
 * Stand down is where a leader is on the days the availability message goes out,
 * and until this surface carried it there was nowhere to record the answers: the
 * season the answers are about does not exist, so `member_availability` has no
 * row to hang them from. */
describe("CwlStandDownPage roll call", () => {
  it("offers the roll call for the month the countdown is pointing at", async () => {
    /* The clock is 22 August, so the countdown reads September and so must the
       control -- they are the same arithmetic, and a button naming a different
       month from the timer above it would be two answers to one question. */
    await act(async () => { render(standDown()); });

    expect(screen.getByRole("button", { name: "Roll call for September 2026" })).toBeVisible();
  });

  /* A page whose job is to be quiet does not get to report a zero. "0 of 2 said
     yes" is true and reads as a failing grade; the button alone says the same
     thing by saying nothing. */
  it("reports the count only once somebody has said yes", async () => {
    await act(async () => { render(standDown()); });
    expect(screen.queryByText(/said yes/)).toBeNull();

    await act(async () => { render(standDown({ client: client({ entries: [{ player_tag: "#SAM" }] }) })); });
    expect(screen.getAllByText(/of 2 said yes/).length).toBeGreaterThan(0);
  });

  /* THE LIST IS THE ANSWERS, NOT THE ROSTER. Fifty rows rendered by default is a
     roster dump that grows with the clan and is mostly people who did not
     answer, so the default view is who said yes and the search reaches the
     rest -- the bench's shape (#20), not a new one. */
  it("shows nothing but an invitation to search when nobody has answered", async () => {
    await act(async () => { render(standDown()); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Roll call for September 2026" })); });

    expect(screen.getByRole("dialog", { name: "Roll call" })).toBeVisible();
    expect(screen.getByText("No answers yet. Search to add whoever liked the message.")).toBeVisible();
    /* Absence is not an answer: silence stays unknown rather than becoming
       unavailable, and the surface shows it by listing nobody rather than by
       saying so (#124). */
    expect(screen.queryByText(/unticked/)).toBeNull();
    expect(screen.queryByRole("button", { name: /Mason/ })).toBeNull();
  });

  it("lists whoever has already said yes, without a search", async () => {
    await act(async () => { render(standDown({ client: client({ entries: [{ player_tag: "#SAM" }] }) })); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Roll call for September 2026" })); });

    expect(screen.getByRole("button", { name: /Sam/, pressed: true })).toBeVisible();
    expect(screen.queryByRole("button", { name: /Mason/ })).toBeNull();
  });

  it("reaches an unanswered member through the search and ticks them", async () => {
    const writes: string[] = [];
    await act(async () => { render(standDown({ client: client({ onWrite: (act) => writes.push(act) }) })); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Roll call for September 2026" })); });
    await act(async () => { fireEvent.change(screen.getByRole("searchbox", { name: "Find a member" }), { target: { value: "mas" } }); });

    expect(screen.getByRole("button", { name: /Mason/, pressed: false })).toBeVisible();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Mason/ })); });

    expect(writes).toEqual(["upsert"]);
    expect(screen.getByRole("button", { name: /Mason/, pressed: true })).toBeVisible();
    expect(screen.getAllByText(/of 2 said yes/).length).toBeGreaterThan(0);
  });

  /* An untick is a DELETE, not a stored "no". The message only collects likes,
     so a recorded no would be an answer nobody gave -- and the member drops out
     of the default list, because the list is the answers. */
  it("unticks a member by removing the entry rather than storing a no", async () => {
    const writes: string[] = [];
    const stub = client({ entries: [{ player_tag: "#SAM" }], onWrite: (act) => writes.push(act) });
    await act(async () => { render(standDown({ client: stub })); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Roll call for September 2026" })); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Sam/ })); });

    expect(writes).toEqual(["delete"]);
    expect(screen.queryByRole("button", { name: /Sam/ })).toBeNull();
    expect(screen.getByText("No answers yet. Search to add whoever liked the message.")).toBeVisible();
  });

  /* THE BOX NEVER SCROLLS AND NEVER RESIZES. Its height is `LIST_MAX_ROWS`
     rows (ADR 0024) and the list never renders more than that, so a query
     matching half the clan is capped and says so rather than growing the page
     while the leader is still typing into the field above it. */
  it("shows no more than ten and says how many it left out", async () => {
    const many = Array.from({ length: 14 }, (_, index) => ({
      player_tag: `#WARDEN${index}`, name: `Warden ${index}`, role: "member", town_hall_level: 15,
    }));
    await act(async () => { render(standDown({ client: client({ members: many }) })); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Roll call for September 2026" })); });
    await act(async () => { fireEvent.change(screen.getByRole("searchbox", { name: "Find a member" }), { target: { value: "warden" } }); });

    expect(screen.getAllByRole("button", { name: /^Warden/ })).toHaveLength(10);
    expect(screen.getByText(/10 of 14 shown/)).toBeVisible();
  });

  /* The cap is not a search behaviour: it applies to the default list too, so a
     month where more than ten answer is read the same way as any other long
     list here -- narrow it. */
  it("caps the default list of answers as well, and says so without a query", async () => {
    const many = Array.from({ length: 14 }, (_, index) => ({
      player_tag: `#WARDEN${index}`, name: `Warden ${index}`, role: "member", town_hall_level: 15,
    }));
    await act(async () => {
      render(standDown({ client: client({ members: many, entries: many.map((member) => ({ player_tag: member.player_tag })) }) }));
    });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Roll call for September 2026" })); });

    expect(screen.getAllByRole("button", { name: /^Warden/ })).toHaveLength(10);
    /* Split across elements by the bold count, so matched on the text node. */
    expect(screen.getAllByText(/of 14 said yes/).length).toBeGreaterThan(0);
    expect(screen.getByText(/10 of 14 shown/)).toBeVisible();
  });

  it("says how many of the roster a search is showing", async () => {
    await act(async () => { render(standDown()); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Roll call for September 2026" })); });
    await act(async () => { fireEvent.change(screen.getByRole("searchbox", { name: "Find a member" }), { target: { value: "zzz" } }); });

    expect(screen.getByText("No one matches “zzz”.")).toBeVisible();
    expect(screen.getByText(/0 shown/)).toBeVisible();
  });
});

describe("rankRollCall", () => {
  const roster = [
    { playerTag: "#B", name: "Bramble", townHallLevel: 16, role: null, saidYes: false },
    { playerTag: "#A", name: "Aster", townHallLevel: 15, role: null, saidYes: true },
    { playerTag: "#C", name: "Calla", townHallLevel: 14, role: null, saidYes: true },
  ];

  it("shows only the answers when there is no query", () => {
    expect(rankRollCall(roster, "").map((member) => member.name)).toEqual(["Aster", "Calla"]);
  });

  /* Ticked first so a name already answered is not offered back as if it were
     new, then alphabetical -- the bench's "ranking does the work sorting used
     to" (#20). */
  it("reaches the whole clan on a query, answered first", () => {
    expect(rankRollCall(roster, "a").map((member) => member.name)).toEqual(["Aster", "Calla", "Bramble"]);
  });

  it("matches on the player tag as well as the name", () => {
    expect(rankRollCall(roster, "#b").map((member) => member.name)).toEqual(["Bramble"]);
  });

  it("ignores surrounding whitespace rather than matching nothing", () => {
    expect(rankRollCall(roster, "  ").map((member) => member.name)).toEqual(["Aster", "Calla"]);
  });
});
