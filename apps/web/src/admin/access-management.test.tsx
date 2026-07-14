import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AccessManagement } from "./access-management.js";

describe("AccessManagement", () => {
  it("shows a newly created invitation only until dismissed", async () => {
    const user = userEvent.setup();
    render(<AccessManagement leaders={[]} onCreateInvitation={vi.fn().mockResolvedValue("https://ops.test/invite/secret")} onPromote={vi.fn()} onRevoke={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Create invitation" }));
    expect(screen.getByText("https://ops.test/invite/secret")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Dismiss invitation" }));
    expect(screen.queryByText("https://ops.test/invite/secret")).not.toBeInTheDocument();
  });

  it("shows an accessible error and allows invitation creation to be retried", async () => {
    const user = userEvent.setup();
    const onCreateInvitation = vi.fn()
      .mockRejectedValueOnce(new Error("Invitation service unavailable"))
      .mockResolvedValueOnce("https://ops.test/invite/retry");
    render(<AccessManagement leaders={[]} onCreateInvitation={onCreateInvitation} onPromote={vi.fn()} onRevoke={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Create invitation" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Invitation service unavailable");
    expect(screen.getByRole("button", { name: "Create invitation" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Create invitation" }));
    expect(await screen.findByText("https://ops.test/invite/retry")).toBeVisible();
  });

  it("announces invitation creation while the request is pending", async () => {
    const user = userEvent.setup();
    let finishInvitation!: (value: string) => void;
    const onCreateInvitation = vi.fn(() => new Promise<string>((resolve) => { finishInvitation = resolve; }));
    render(<AccessManagement leaders={[]} onCreateInvitation={onCreateInvitation} onPromote={vi.fn()} onRevoke={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Create invitation" }));

    expect(screen.getByRole("button", { name: "Creating invitation…" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Creating invitation");

    finishInvitation("https://ops.test/invite/pending");
    expect(await screen.findByText("https://ops.test/invite/pending")).toBeVisible();
  });
});
