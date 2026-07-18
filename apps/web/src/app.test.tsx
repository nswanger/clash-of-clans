import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App, type AppSession } from "./app.js";

const signedOut: AppSession = { status: "signed_out" };
const loading: AppSession = { status: "loading" };
const accessDenied: AppSession = { status: "access_denied", message: "Your leader access has been revoked." };
const leader: AppSession = { status: "signed_in", displayName: "Nick", role: "leader" };
const admin: AppSession = { status: "signed_in", displayName: "Nick", role: "admin" };

describe("App access boundaries", () => {
  it("shows a loading state while authentication is resolving", () => {
    render(<App session={loading} />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading your war room");
  });

  it("routes signed-out users to Discord login", () => {
    render(<App session={signedOut} />);

    expect(screen.getByText("CWL War Ops")).toBeVisible();
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
    expect(screen.getByRole("link", { name: "Access" })).toHaveAttribute("href", "#/access");
  });

  it("shows a clear access-denied state for revoked users", () => {
    render(<App session={accessDenied} />);

    expect(screen.getByRole("heading", { name: "Access unavailable" })).toBeVisible();
    expect(screen.getByText("Your leader access has been revoked.")).toBeVisible();
  });
});
