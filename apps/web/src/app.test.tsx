import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App, type AppSession } from "./app.js";

const signedOut: AppSession = { status: "signed_out" };
const leader: AppSession = { status: "signed_in", displayName: "Nick", role: "leader" };
const admin: AppSession = { status: "signed_in", displayName: "Nick", role: "admin" };

describe("App access boundaries", () => {
  it("routes signed-out users to Discord login", () => {
    render(<App session={signedOut} />);

    expect(screen.getByRole("heading", { name: "Leader access" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Continue with Discord" })).toBeVisible();
  });

  it("does not expose access management to leaders", () => {
    render(<App session={leader} />);

    expect(screen.getByRole("navigation", { name: "Primary" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "Access" })).not.toBeInTheDocument();
  });

  it("exposes access management to admins", () => {
    render(<App session={admin} />);

    expect(screen.getByRole("link", { name: "Access" })).toBeVisible();
  });
});
