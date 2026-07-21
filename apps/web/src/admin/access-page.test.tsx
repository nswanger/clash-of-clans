import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AccessManagementSnapshot } from "../data/operations.js";
import { AccessPage } from "./access-page.js";

const snapshot: AccessManagementSnapshot = {
  people: [{ id: "admin-self", name: "Nick", role: "admin", isCurrentUser: true }],
  invitations: [],
  auditEvents: [],
};

describe("AccessPage", () => {
  it("loads the protected snapshot and refreshes after creating an invitation", async () => {
    const user = userEvent.setup();
    const rpc = vi.fn().mockImplementation((name: string) => Promise.resolve({
      data: name === "create_invitation" ? "one-time-token" : snapshot,
      error: null,
    }));

    render(<AccessPage client={{ rpc }} origin="https://ops.test/clash-of-clans/" />);

    expect(await screen.findByText("Nick")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Create invitation" }));
    expect(await screen.findByText("https://ops.test/clash-of-clans/?invitation=one-time-token")).toBeVisible();
    expect(rpc).toHaveBeenCalledWith("create_invitation", expect.objectContaining({ invitation_expires_at: expect.any(String) }));
    expect(rpc.mock.calls.filter(([name]) => name === "get_access_management_snapshot")).toHaveLength(2);
  });

  it("shows an initial load error and retries without leaving the route", async () => {
    const user = userEvent.setup();
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: null, error: { message: "Temporary failure" } })
      .mockResolvedValueOnce({ data: snapshot, error: null });

    render(<AccessPage client={{ rpc }} origin="https://ops.test/" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Temporary failure");
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.getByText("Nick")).toBeVisible());
  });
});
