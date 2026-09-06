import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MembersPage } from "./members-page.js";

/* jsdom reports `(min-width: 720px)` as false, so every test here exercises the
 * narrow layout: the panel is a sheet that only opens when a row is pressed,
 * rather than a docked column that opens on the first member by default. */
function clientWith(rows: unknown[], activityRows: unknown[] = []) {
  const rpc = vi.fn().mockResolvedValue({ data: activityRows, error: null });
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: rows, error: null }),
      }),
    }),
    rpc,
  };
}

describe("MembersPage", () => {
  it("reports what a member was observed doing in wars we logged", async () => {
    render(<MembersPage client={clientWith([databaseRow()], [activityRow()])} clanTag="#CLAN" />);

    await userEvent.click(await screen.findByRole("button", { name: /One/ }));

    const panel = within(screen.getByRole("dialog", { name: "One" }));
    expect(panel.getByText("Activity observed · 7 days")).toBeVisible();
    expect(panel.getByText("2 of 3 logged")).toBeVisible();
    expect(panel.getByText("3 of 4")).toBeVisible();
  });

  /* The per-player pull can miss one member while the members list landed, and
     the card is the only per-member view of that. The gap is marked rather than
     dashed, and the pull times themselves stay on Admin's collector board. */
  it("marks a profile that did not land in the latest run, and carries no pull times", async () => {
    render(<MembersPage client={clientWith([{ ...databaseRow(), profile_observed_at: null, war_preference: null }], [activityRow()])} clanTag="#CLAN" />);

    await userEvent.click(await screen.findByRole("button", { name: /One/ }));

    const panel = within(screen.getByRole("dialog", { name: "One" }));
    expect(panel.getByText("not pulled this run")).toBeVisible();
    expect(panel.queryByText(/observed 7\//)).toBeNull();
  });

  it("calls a window with no logged war building history rather than inactivity", async () => {
    const client = clientWith([databaseRow()], [activityRow({ wars_observed: 0, wars_participated: 0, assigned_attacks: 0, attacks_made: 0, stars: 0 })]);
    render(<MembersPage client={client} clanTag="#CLAN" />);

    await userEvent.click(await screen.findByRole("button", { name: /Building history/ }));

    expect(screen.getByText(/no evidence either way. Absent evidence is not inactivity/)).toBeVisible();
  });

  it("distinguishes a member who sat out logged wars from one with no evidence", async () => {
    const client = clientWith([databaseRow()], [activityRow({ wars_participated: 0, assigned_attacks: 0, attacks_made: 0, stars: 0 })]);
    render(<MembersPage client={client} clanTag="#CLAN" />);

    await userEvent.click(await screen.findByRole("button", { name: /No war activity/ }));

    expect(screen.getByText("No war activity observed · 7 days")).toBeVisible();
    expect(screen.getByText(/That is not the same as inactive/)).toBeVisible();
  });

  it("filters the roster by member name", async () => {
    const other = { ...databaseRow(), player_tag: "#TWO", name: "Two", clan_rank: 2 };
    render(<MembersPage client={clientWith([databaseRow(), other], [activityRow()])} clanTag="#CLAN" />);
    await screen.findByRole("button", { name: /One/ });

    await userEvent.type(screen.getByRole("searchbox", { name: "Find a member" }), "Two");

    expect(screen.queryByRole("button", { name: /One/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Two/ })).toBeVisible();
  });

  it("filters the roster by role from the filter panel", async () => {
    const other = { ...databaseRow(), player_tag: "#TWO", name: "Two", role: "member", clan_rank: 2 };
    render(<MembersPage client={clientWith([databaseRow(), other], [activityRow()])} clanTag="#CLAN" />);
    await screen.findByRole("button", { name: /One/ });

    await userEvent.click(screen.getByRole("button", { name: /^Filters/ }));
    await userEvent.click(screen.getByRole("button", { name: "Elder" }));

    expect(screen.getByRole("button", { name: /One/ })).toBeVisible();
    expect(screen.queryByRole("button", { name: /Two/ })).not.toBeInTheDocument();
  });

  it("re-reads observed war activity when the window changes", async () => {
    const client = clientWith([databaseRow()], [activityRow()]);
    render(<MembersPage client={client} clanTag="#CLAN" />);
    await screen.findByRole("button", { name: /One/ });

    await userEvent.click(screen.getByRole("button", { name: "3 days" }));

    expect(client.rpc).toHaveBeenLastCalledWith("regular_war_member_activity_window", {
      requested_clan_tag: "#CLAN", requested_window_days: 3,
    });
    expect(await screen.findByText("Activity observed · 3 days")).toBeVisible();
  });

  it("reports a failed load in the one notice region", async () => {
    const client = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: null, error: { message: "permission denied" } }),
        }),
      }),
      rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    render(<MembersPage client={client} clanTag="#CLAN" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("permission denied");
  });

});

function databaseRow() {
  return {
    clan_tag: "#CLAN", player_tag: "#ONE", name: "One", role: "elder", clan_rank: 1,
    town_hall_level: 17, league_name: "Legend League",
    donations: 325, donations_received: 95, war_preference: "in",
    roster_observed_at: "2026-07-08T12:00:00Z", profile_observed_at: "2026-07-08T12:00:30Z",
    first_observed_present_on: "2026-07-01", is_current_member: true,
    current_presence_started_on: "2026-07-01", departure_observed_on: null,
  };
}

function activityRow(overrides: Record<string, unknown> = {}) {
  return {
    clan_tag: "#CLAN", player_tag: "#ONE", window_days: 7,
    window_started_at: "2026-07-01T12:00:00Z", wars_observed: 3, wars_participated: 2,
    assigned_attacks: 4, attacks_made: 3, stars: 7, last_observed_at: "2026-07-07T12:00:00Z",
    activity_score: 75, performance_score: 78, stars_per_attack: 2.33, incomplete_wars: 0,
    ...overrides,
  };
}
