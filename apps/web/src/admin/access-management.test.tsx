import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AccessManagementSnapshot } from "../data/operations.js";
import { AccessManagement } from "./access-management.js";

const snapshot: AccessManagementSnapshot = {
  people: [
    { id: "admin-self", name: "Nick", role: "admin", isCurrentUser: true },
    { id: "admin-two", name: "Ada", role: "admin", isCurrentUser: false },
    { id: "leader-one", name: "Grace", role: "leader", isCurrentUser: false },
  ],
  invitations: [
    {
      id: "invite-pending",
      status: "pending",
      createdAt: "2026-07-20T12:00:00Z",
      expiresAt: "2026-07-21T12:00:00Z",
      createdByName: "Nick",
      usedAt: null,
      usedByName: null,
      revokedAt: null,
      revokedByName: null,
      reissuedFromId: null,
      reissuedInvitationId: null,
    },
    {
      id: "invite-used",
      status: "redeemed",
      createdAt: "2026-07-18T12:00:00Z",
      expiresAt: "2026-07-19T12:00:00Z",
      createdByName: "Nick",
      usedAt: "2026-07-18T13:00:00Z",
      usedByName: "Grace",
      revokedAt: null,
      revokedByName: null,
      reissuedFromId: null,
      reissuedInvitationId: null,
    },
  ],
  auditEvents: [
    {
      id: "event-one",
      eventType: "role_granted",
      actorName: "Nick",
      targetName: "Grace",
      eventData: { role: "leader" },
      occurredAt: "2026-07-18T13:00:00Z",
    },
    {
      id: "event-two",
      eventType: "role_granted",
      actorName: "Nick",
      targetName: null,
      eventData: { role: "admin" },
      occurredAt: "2026-07-18T12:00:00Z",
    },
  ],
};

function renderAccess(overrides: Partial<React.ComponentProps<typeof AccessManagement>> = {}) {
  const props: React.ComponentProps<typeof AccessManagement> = {
    snapshot,
    loadError: undefined,
    onRetryLoad: vi.fn().mockResolvedValue(undefined),
    onCreateInvitation: vi.fn().mockResolvedValue("https://ops.test/?invitation=secret"),
    onReissueInvitation: vi.fn().mockResolvedValue("https://ops.test/?invitation=reissued"),
    onRevokeInvitation: vi.fn().mockResolvedValue(undefined),
    onPromote: vi.fn().mockResolvedValue(undefined),
    onDemote: vi.fn().mockResolvedValue(undefined),
    onRevokeAccess: vi.fn().mockResolvedValue(undefined),
    onCopyInvitation: vi.fn().mockResolvedValue(undefined),
    confirmAction: vi.fn().mockReturnValue(true),
    ...overrides,
  };
  render(<AccessManagement {...props} />);
  return props;
}

describe("AccessManagement", () => {
  it("shows people, invitation status, and access audit history without stored links", () => {
    renderAccess();
    expect(screen.getByRole("heading", { name: "People" })).toBeVisible();
    expect(screen.getByText("Current account")).toBeVisible();
    expect(screen.getByText("Redeemed by Grace", { exact: false })).toBeVisible();
    expect(screen.getByText("Nick granted leader access to Grace")).toBeVisible();
    expect(screen.getByText("Nick granted admin access to an account")).toBeVisible();
    expect(screen.queryByText(/secret/)).not.toBeInTheDocument();
  });

  it("creates and copies a one-time invitation link", async () => {
    const user = userEvent.setup();
    const props = renderAccess();
    await user.click(screen.getByRole("button", { name: "Create invitation" }));
    expect(await screen.findByText("https://ops.test/?invitation=secret")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Copy link" }));
    expect(props.onCopyInvitation).toHaveBeenCalledWith("https://ops.test/?invitation=secret");
    expect(await screen.findByRole("status")).toHaveTextContent("Invitation link copied");
  });

  it("confirms and reissues a pending invitation", async () => {
    const user = userEvent.setup();
    const props = renderAccess();
    await user.click(screen.getByRole("button", { name: "Reissue" }));
    expect(props.confirmAction).toHaveBeenCalledWith(expect.stringContaining("current link will stop working"));
    expect(props.onReissueInvitation).toHaveBeenCalledWith("invite-pending");
    expect(await screen.findByText("https://ops.test/?invitation=reissued")).toBeVisible();
  });

  it("does not mutate access when confirmation is declined", async () => {
    const user = userEvent.setup();
    const props = renderAccess({ confirmAction: vi.fn().mockReturnValue(false) });
    await user.click(screen.getByRole("button", { name: "Demote to leader" }));
    await user.click(screen.getAllByRole("button", { name: "Revoke access" })[0]!);
    expect(props.onDemote).not.toHaveBeenCalled();
    expect(props.onRevokeAccess).not.toHaveBeenCalled();
  });

  it("hides self-lockout actions and supports promotion", async () => {
    const user = userEvent.setup();
    const props = renderAccess();
    const selfRow = screen.getByText("Nick").closest("li")!;
    expect(within(selfRow).queryByRole("button")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Promote to admin" }));
    expect(props.onPromote).toHaveBeenCalledWith("leader-one");
    expect(await screen.findByRole("status")).toHaveTextContent("Grace is now an admin");
  });

  it("shows a recoverable row error after a failed mutation", async () => {
    const user = userEvent.setup();
    const onRevokeInvitation = vi.fn().mockRejectedValue(new Error("Invitation is no longer pending"));
    const props = renderAccess({ onRevokeInvitation });
    await user.click(screen.getByRole("button", { name: "Revoke" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Invitation is no longer pending");
    await user.click(screen.getByRole("button", { name: "Refresh status" }));
    expect(props.onRetryLoad).toHaveBeenCalled();
  });
});
