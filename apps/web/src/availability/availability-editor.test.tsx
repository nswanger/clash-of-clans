import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AvailabilityEditor } from "./availability-editor.js";

describe("AvailabilityEditor", () => {
  it("submits an explicit availability choice and note", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<AvailabilityEditor playerName="Sam" initialAvailability="unknown" onSave={onSave} />);

    await user.click(screen.getByRole("radio", { name: "Available" }));
    await user.type(screen.getByLabelText("Leader note"), "Confirmed in Discord");
    await user.click(screen.getByRole("button", { name: "Save availability" }));

    expect(onSave).toHaveBeenCalledWith({ availability: "available", note: "Confirmed in Discord" });
  });
});
