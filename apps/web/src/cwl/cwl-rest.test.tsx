import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CwlSeasonPhaseSnapshot } from "../data/operations.js";
import { CwlStandDownPage } from "./cwl-rest.js";

function snapshot(overrides: Partial<CwlSeasonPhaseSnapshot> = {}): CwlSeasonPhaseSnapshot {
  return {
    clanTag: "#CLAN",
    seasonId: "2026-08",
    bonusesAdministeredAt: "2026-08-14T18:22:00Z",
    seasonIds: ["2026-08", "2026-07", "2026-06"],
    warDays: [{ warDay: 1, state: "warEnded", endTime: "2026-08-11T23:59:59Z" }],
    ...overrides,
  };
}

function client() {
  return { rpc: vi.fn().mockResolvedValue({ data: { clanTag: "#CLAN", seasonId: "2026-08", bonusesAdministeredAt: null }, error: null }) };
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
    expect(screen.getByText(/appears here as soon as it is collected/)).toBeVisible();
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
      requested_clan_tag: "#CLAN", requested_season_id: "2026-08", administered: false,
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
    const earlier = screen.getByRole("menuitem", { name: "2026-07" });
    expect(earlier).toBeEnabled();

    fireEvent.click(earlier);
    expect(onSeason).toHaveBeenCalledWith("2026-07");
  });

  /* The season on screen is where you already are, so it is marked rather than
     offered as a destination. */
  it("marks the season it is standing down from", () => {
    render(standDown());

    fireEvent.click(screen.getByRole("button", { name: "Season options" }));

    expect(screen.getByRole("menuitem", { name: /2026-08/ })).toHaveAttribute("aria-current", "true");
  });
});
