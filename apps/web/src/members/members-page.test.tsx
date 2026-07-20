import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MembersPage, RosterOverviewPage } from "./members-page.js";

function clientWith(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: rows, error: null }),
      }),
    }),
  };
}

describe("MembersPage", () => {
  it("shows explainable recent activity without presenting it as war reliability", async () => {
    render(<MembersPage client={clientWith([databaseRow()])} clanTag="#CLAN" />);

    expect(await screen.findByRole("heading", { name: "One" })).toBeVisible();
    expect(screen.getByText("Activity observed", { selector: ".activity-status" })).toBeVisible();
    expect(screen.getByText("+14 multiplayer attacks")).toBeVisible();
    expect(screen.getByText(/No change observed.*does not mean inactive/)).toBeVisible();
  });

  it("filters the roster by member name", async () => {
    const other = { ...databaseRow(), player_tag: "#TWO", name: "Two", clan_rank: 2 };
    render(<MembersPage client={clientWith([databaseRow(), other])} clanTag="#CLAN" />);
    await screen.findByRole("heading", { name: "One" });

    await userEvent.type(screen.getByRole("textbox", { name: "Find a member" }), "Two");

    expect(screen.queryByRole("heading", { name: "One" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Two" })).toBeVisible();
  });

  it("summarizes the year-round roster separately from CWL operations", async () => {
    render(<RosterOverviewPage client={clientWith([databaseRow()])} clanTag="#CLAN" />);

    expect(await screen.findByText("Current members")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Clan overview" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Review members" })).toHaveAttribute("href", "#/members");
  });
});

function databaseRow() {
  return {
    clan_tag: "#CLAN", player_tag: "#ONE", name: "One", role: "elder", clan_rank: 1,
    previous_clan_rank: 2, town_hall_level: 17, trophies: 5060, league_id: 1,
    league_name: "Legend League", donations: 325, donations_received: 95,
    war_preference: "in", war_stars: 100, attack_wins: 24, defense_wins: 4,
    clan_capital_contributions: 2500, clan_games_points: 500,
    roster_observed_at: "2026-07-08T12:00:00Z", profile_observed_at: "2026-07-08T12:00:30Z",
    first_observed_present_on: "2026-07-01", last_observed_present_on: "2026-07-08",
    is_current_member: true, current_presence_started_on: "2026-07-01", departure_observed_on: null, baseline_1d: null,
    baseline_7d: {
      observed_on: "2026-07-01", role: "member", town_hall_level: 17, trophies: 5000,
      league_id: 1, donations: 100, donations_received: 80, war_preference: "out",
      attack_wins: 10, defense_wins: 4, clan_capital_contributions: 2000, clan_games_points: 6000,
    },
    baseline_30d: null,
  };
}
