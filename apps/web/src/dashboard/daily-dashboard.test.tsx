import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DailyDashboard, type DailyDashboardData } from "./daily-dashboard.js";

const dashboardData: DailyDashboardData = {
  clanName: "Ironwood",
  warDay: 3,
  warEndsAt: "2026-07-12T20:14:08.000Z",
  attacksUsed: 11,
  attacksAvailable: 15,
  availableMembers: 22,
  awaitingAvailability: 3,
  membersAtEightStars: 9,
  membersWithinThreeStars: 5,
  season: {
    position: 3,
    groupSize: 8,
    stars: 84,
    roundsRemaining: 2,
    leagueName: "Crystal III",
    outcome: "staying",
  },
  recommendations: {
    remove: [
      { playerTag: "#MASON", name: "Mason", townHallLevel: 15, reason: "Missed the assigned attack on Day 2" },
      { playerTag: "#NOVA", name: "Nova", townHallLevel: 14, reason: "Rotating after reaching the core threshold" },
    ],
    add: [
      { playerTag: "#SAM", name: "Sam", townHallLevel: 15, reason: "Available and restores the required position", details: "Applied rule order" },
      { playerTag: "#KIRA", name: "Kira", townHallLevel: 14, reason: "6 stars in 2 attacks; eligible for rotation" },
    ],
  },
  updatedAt: "2026-07-12T17:56:00.000Z",
};

describe("DailyDashboard", () => {
  it("shows functional daily KPIs and grouped lineup actions", () => {
    render(<DailyDashboard data={dashboardData} now={new Date("2026-07-12T18:00:00.000Z")} />);

    expect(screen.getByText("02:14:08")).toBeVisible();
    expect(screen.getByText("11 / 15")).toBeVisible();
    expect(screen.getByText("22")).toBeVisible();
    expect(screen.getByText("9")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Remove these members" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Add these members" })).toBeVisible();
    expect(screen.getByText("3rd of 8 clans · currently staying in Crystal III")).toBeVisible();
  });

  it("keeps recommendation details hidden until requested", async () => {
    const user = userEvent.setup();
    render(<DailyDashboard data={dashboardData} now={new Date("2026-07-12T18:00:00.000Z")} />);

    expect(screen.queryByText("Applied rule order")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Why Sam?" }));
    expect(screen.getByText("Applied rule order")).toBeVisible();
  });
});
