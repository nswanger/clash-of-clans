import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
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
  contacts: [],
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

  it("omits optional KPI and outcome claims when the underlying facts are unavailable", () => {
    const { outcome: _outcome, ...seasonWithoutOutcome } = dashboardData.season!;
    render(
      <DailyDashboard
        data={{ ...dashboardData, membersWithinThreeStars: 0, season: seasonWithoutOutcome }}
        now={new Date("2026-07-12T21:00:00.000Z")}
      />,
    );

    expect(screen.getByText("00:00:00")).toBeVisible();
    expect(screen.queryByText("0 more within 3 stars")).not.toBeInTheDocument();
    expect(screen.getByText("3rd of 8 clans")).toBeVisible();
    expect(screen.queryByText(/currently/)).not.toBeInTheDocument();
  });

  it("surfaces blocking collection and coverage warnings", () => {
    render(<DailyDashboard data={{ ...dashboardData, warnings: [
      { code: "invalidIp", message: "Clash API access is blocked for this collector IP." },
      { code: "coverage_gap", message: "No eligible substitute is available for position 11." },
    ] }} />);
    expect(screen.getAllByRole("alert")).toHaveLength(2);
    expect(screen.getByText(/collector IP/)).toBeVisible();
    expect(screen.getByText(/position 11/)).toBeVisible();
  });

  it("surfaces members whose availability needs contact", () => {
    render(<DailyDashboard data={{ ...dashboardData, contacts: [
      { playerTag: "#KIRA", name: "Kira", reason: "Availability is unknown" },
    ] }} />);

    expect(screen.getByRole("heading", { name: "Contact needed" })).toBeVisible();
    expect(screen.getByText("Kira — Availability is unknown")).toBeVisible();
  });

  it("shows a clear no-change state", () => {
    render(<DailyDashboard data={{ ...dashboardData, recommendations: { remove: [], add: [] } }} />);
    expect(screen.getByText("No lineup changes recommended")).toBeVisible();
  });

  it("exposes explicit approve and edit actions", async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn();
    const onEdit = vi.fn();
    render(<DailyDashboard data={dashboardData} onApprove={onApprove} onEdit={onEdit} />);
    await user.click(screen.getByRole("button", { name: "Approve changes" }));
    await user.click(screen.getByRole("button", { name: "Edit lineup" }));
    expect(onApprove).toHaveBeenCalledOnce();
    expect(onEdit).toHaveBeenCalledOnce();
  });
});
