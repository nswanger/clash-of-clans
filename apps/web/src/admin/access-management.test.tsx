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
});
