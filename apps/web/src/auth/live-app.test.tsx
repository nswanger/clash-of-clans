import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { LiveApp, type LiveSessionClient } from "./live-app.js";

function createClient() {
  const profileQuery = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { display_name: "Nick" }, error: null }) };
  return {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: "user-1" } } }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      signInWithOAuth: vi.fn().mockResolvedValue({ error: null }),
    },
    from: vi.fn(() => profileQuery),
    rpc: vi.fn().mockImplementation((name: string) => Promise.resolve(name === "has_app_role" ? { data: true, error: null } : { error: null })),
  } as unknown as LiveSessionClient;
}

describe("LiveApp", () => {
  it("loads the current Supabase session and role", async () => {
    render(<LiveApp client={createClient()} location={{ href: "https://ops.example/", origin: "https://ops.example", pathname: "/" }} />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading your war room");
    await waitFor(() => expect(screen.getByText("Nick")).toBeVisible());
  });

  it("shows login for a signed-out invitee without attempting redemption", async () => {
    const user = userEvent.setup();
    const client = createClient();
    vi.mocked(client.auth.getSession).mockResolvedValue({ data: { session: null }, error: null });
    render(<LiveApp client={client} location={{ href: "https://ops.example/?invitation=secret", origin: "https://ops.example", pathname: "/" }} />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Leader access" })).toBeVisible());
    expect(client.rpc).not.toHaveBeenCalledWith("redeem_invitation", expect.anything());
    await user.click(screen.getByRole("button", { name: "Continue with Discord" }));
    expect(sessionStorage.getItem("pending-invitation")).toBe("secret");
    expect(client.auth.signInWithOAuth).toHaveBeenCalledWith(expect.objectContaining({ options: { redirectTo: "https://ops.example/?authCallback=1&returnTo=%23%2F" } }));
  });

  it("shows a clear access error when Discord sign-in cannot start", async () => {
    const user = userEvent.setup();
    const client = createClient();
    vi.mocked(client.auth.getSession).mockResolvedValue({ data: { session: null }, error: null });
    vi.mocked(client.auth.signInWithOAuth).mockResolvedValue({ error: { message: "Discord provider is not enabled" } });
    render(<LiveApp client={client} location={{ href: "https://ops.example/", origin: "https://ops.example", pathname: "/" }} />);

    await user.click(await screen.findByRole("button", { name: "Continue with Discord" }));

    expect(await screen.findByRole("heading", { name: "Access unavailable" })).toBeVisible();
    expect(screen.getByText("Discord provider is not enabled")).toBeVisible();
  });

  it("subscribes to auth changes and unsubscribes on unmount", () => {
    const client = createClient();
    const unsubscribe = vi.fn();
    vi.mocked(client.auth.onAuthStateChange).mockReturnValue({ data: { subscription: { unsubscribe } } });

    const view = render(<LiveApp client={client} location={{ href: "https://ops.example/", origin: "https://ops.example", pathname: "/" }} />);
    view.unmount();

    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("scrubs invitation secrets and restores the intended route", async () => {
    const replaceState = vi.fn();
    render(<LiveApp
      client={createClient()}
      location={{ href: "https://ops.example/clash-of-clans/?authCallback=1&invitation=secret&returnTo=%23%2Fseason", origin: "https://ops.example", pathname: "/clash-of-clans/" }}
      navigation={{ replaceState, assign: vi.fn() }}
      basePath="/clash-of-clans/"
    />);

    await waitFor(() => expect(replaceState).toHaveBeenCalledWith("/clash-of-clans/#/season"));
  });
});
