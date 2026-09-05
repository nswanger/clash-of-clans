import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { App, type AppSession } from "./app.js";
import { AppTopbar } from "./app-chrome.js";

const signedOut: AppSession = { status: "signed_out" };
const loading: AppSession = { status: "loading" };
const accessDenied: AppSession = { status: "access_denied", message: "Your leader access has been revoked." };
const leader: AppSession = { status: "signed_in", displayName: "Nick", role: "leader", isOperator: false };
const admin: AppSession = { status: "signed_in", displayName: "Nick", role: "admin", isOperator: false };

/* The nav is the page name in `cm-topbar` (#58), so a signed-in `App` renders no
 * chrome of its own — it provides the session and a surface renders the bar.
 * Every signed-in assertion therefore goes through a real topbar, which is also
 * the only way to test the thing that actually replaced the nav. */
function signedInApp(session: AppSession, onSignOut = () => {}) {
  return <App session={session} onSignOut={onSignOut}>
    <AppTopbar route="members" eyebrow="Year-round clan" title="Members" />
  </App>;
}

describe("App access boundaries", () => {
  /* Loading has no copy at all (#43 deleted the app's six loading strings, and
     "Loading your war room…" was the last of them). What survives is the
     announcement, which is why deleting the visible string cost nothing. */
  it("announces a resolving session without any visible loading copy", () => {
    render(<App session={loading} />);

    expect(screen.getByRole("status")).toHaveTextContent("Checking your access");
    expect(screen.queryByText(/Loading/)).not.toBeInTheDocument();
  });

  it("routes signed-out users to Discord login", () => {
    render(<App session={signedOut} />);

    /* The product name survives here and only here: the auth shell is the one
       surface with no page name to carry it (#24 as amended by #58). */
    expect(screen.getByRole("heading", { name: "Clan Muster" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Continue with Discord" })).toBeVisible();
  });

  it("discloses the routes from the page name rather than a nav bar", async () => {
    const user = userEvent.setup();
    render(signedInApp(leader));

    expect(screen.queryByRole("link", { name: "Members" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Members/ }));

    expect(screen.getByRole("link", { name: "CWL" })).toHaveAttribute("href", "#/cwl");
    expect(screen.getByRole("link", { name: "Members" })).toHaveAttribute("href", "#/members");
    expect(screen.getByRole("link", { name: "Members" })).toHaveAttribute("aria-current", "page");
  });

  it("does not offer Admin to leaders", async () => {
    const user = userEvent.setup();
    render(signedInApp(leader));

    await user.click(screen.getByRole("button", { name: /Members/ }));

    expect(screen.queryByRole("link", { name: "Admin" })).not.toBeInTheDocument();
  });

  it("offers Admin to admins", async () => {
    const user = userEvent.setup();
    render(signedInApp(admin));

    await user.click(screen.getByRole("button", { name: /Members/ }));

    expect(screen.getByRole("link", { name: "Admin" })).toHaveAttribute("href", "#/admin");
  });

  /* The app had no route to sign out at all before #58 — the display name was a
     bare span with no affordance. */
  it("signs out from the account control", async () => {
    const user = userEvent.setup();
    const onSignOut = vi.fn();
    render(signedInApp(admin, onSignOut));

    await user.click(screen.getByRole("button", { name: "Nick — account and sign out" }));
    await user.click(screen.getByRole("menuitem", { name: "Sign out" }));

    expect(onSignOut).toHaveBeenCalled();
  });

  /* Absence, not apology: no notice region and no danger colour. Nothing has
     gone wrong — this account is simply not on the list. */
  it("shows a clear access-denied state for revoked users", () => {
    render(<App session={accessDenied} />);

    expect(screen.getByRole("heading", { name: "Not on the roster" })).toBeVisible();
    expect(screen.getByText("Your leader access has been revoked.")).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
