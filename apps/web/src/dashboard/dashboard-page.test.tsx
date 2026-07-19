import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import type { DailyDashboardData } from "./daily-dashboard.js";
import { DashboardPage } from "./dashboard-page.js";

const data: DailyDashboardData = {
  clanName: "#CLAN", clanMembers: [], warDay: 1, warEndsAt: "2026-07-13T20:00:00.000Z",
  attacksUsed: 0, attacksAvailable: 15, availableMembers: 10, awaitingAvailability: 5,
  membersAtEightStars: 2, membersWithinThreeStars: 3,
  season: { verificationStatus: "verified", position: 1, groupSize: 1, stars: 0, roundsRemaining: 0, leagueName: "CWL" },
  recommendations: { remove: [{ playerTag: "#OUT", name: "Out", townHallLevel: 15, reason: "Rotate" }], add: [{ playerTag: "#IN", name: "In", townHallLevel: 16, reason: "Available" }] },
  recommendationId: "recommendation-1", finalChanges: [{ outPlayerTag: "#OUT", inPlayerTag: "#IN" }],
  contacts: [], updatedAt: "2026-07-12T18:00:00.000Z",
};

describe("DashboardPage", () => {
  it("shows loading until live dashboard data resolves", async () => {
    let resolveLoad!: (value: DailyDashboardData) => void;
    const load = vi.fn(() => new Promise<DailyDashboardData>((resolve) => { resolveLoad = resolve; }));
    render(<DashboardPage load={load} />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading daily operations");
    expect(screen.getByRole("heading", { name: "Daily command" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Daily summary" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Season position" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Recommended lineup update" })).toBeVisible();

    resolveLoad(data);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Daily command" })).toBeVisible());
  });

  it("shows a clear data-loading error", async () => {
    render(<DashboardPage load={vi.fn().mockRejectedValue(new Error("No active CWL war is available."))} />);

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("No active CWL war is available."));
  });

  it("persists overrides", async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn().mockResolvedValue(undefined);
    const onOverride = vi.fn().mockResolvedValue(undefined);
    render(<DashboardPage load={vi.fn().mockResolvedValue(data)} onApprove={onApprove} onOverride={onOverride} />);
    await screen.findByRole("heading", { name: "Daily command" });
    await user.click(screen.getByRole("button", { name: "Edit lineup" }));
    await user.type(screen.getByRole("textbox", { name: "Override note" }), "Swap adjusted after clan chat");
    await user.click(screen.getByRole("button", { name: "Save override" }));
    expect(onOverride).toHaveBeenCalledWith("recommendation-1", data.finalChanges, "Swap adjusted after clan chat");
  });

  it("persists approvals and prevents duplicate actions", async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn().mockResolvedValue(undefined);
    render(<DashboardPage load={vi.fn().mockResolvedValue(data)} onApprove={onApprove} />);
    await screen.findByRole("heading", { name: "Daily command" });
    await user.click(screen.getByRole("button", { name: "Approve changes" }));
    expect(onApprove).toHaveBeenCalledWith("recommendation-1", data.finalChanges);
    expect(await screen.findByRole("button", { name: "Approve changes" })).toBeDisabled();
  });

  it("regenerates recommendations, shows progress, and reloads dashboard data", async () => {
    const user = userEvent.setup();
    let resolveRegeneration!: () => void;
    const onRegenerate = vi.fn(() => new Promise<{ status: "persisted"; recommendationId: string; created: boolean }>((resolve) => {
      resolveRegeneration = () => resolve({ status: "persisted", recommendationId: "recommendation-2", created: true });
    }));
    const load = vi.fn().mockResolvedValue(data);

    render(<DashboardPage load={load} onRegenerate={onRegenerate} />);
    await screen.findByRole("heading", { name: "Daily command" });
    await user.click(screen.getByRole("button", { name: "Regenerate recommendations" }));

    expect(onRegenerate).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Regenerating recommendations" })).toBeDisabled();

    resolveRegeneration();
    expect(await screen.findByRole("status")).toHaveTextContent("Recommendations regenerated");
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
  });

  it("reports idle-CWL and failure results without replacing the dashboard", async () => {
    const user = userEvent.setup();
    const onRegenerate = vi.fn()
      .mockResolvedValueOnce({ status: "skipped", reason: "no_active_cwl_context" })
      .mockRejectedValueOnce(new Error("Recommendation regeneration failed"));

    render(<DashboardPage load={vi.fn().mockResolvedValue({ ...data, state: "no_season" })} onRegenerate={onRegenerate} />);
    await screen.findByRole("heading", { name: "Daily command" });

    await user.click(screen.getByRole("button", { name: "Regenerate recommendations" }));
    expect(await screen.findByText("No active CWL context is available yet.")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Regenerate recommendations" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Recommendation regeneration failed");
    expect(screen.getByRole("heading", { name: "Daily command" })).toBeVisible();
  });
});
