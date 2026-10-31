import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PlayerClaim } from "./player-claim.js";

const roster = [
  { player_tag: "#TESTMAIN", name: "Main", town_hall_level: 17 },
  { player_tag: "#TESTALT", name: "Alt", town_hall_level: 12 },
];

function clientWith(overrides: Record<string, { data?: unknown; error: { message: string } | null }> = {}) {
  return {
    rpc: vi.fn((name: string) => Promise.resolve(overrides[name] ?? (name === "list_linkable_players" ? { data: roster, error: null } : { data: null, error: null }))),
  };
}

describe("PlayerClaim", () => {
  it("claims the member picked from the clan's linkable roster", async () => {
    const user = userEvent.setup();
    const client = clientWith();
    const onAnswered = vi.fn();
    render(<PlayerClaim client={client} clanTag="#TESTCLAN" onAnswered={onAnswered} />);

    expect(screen.getByRole("heading", { name: "Which member are you?" })).toBeVisible();
    await user.click(await screen.findByRole("button", { name: /Main/ }));

    expect(client.rpc).toHaveBeenCalledWith("list_linkable_players", { requested_clan_tag: "#TESTCLAN" });
    expect(client.rpc).toHaveBeenCalledWith("claim_player", { player_tag: "#TESTMAIN" });
    expect(onAnswered).toHaveBeenCalledTimes(1);
  });

  it("continues as a guest from Not in the clan", async () => {
    const user = userEvent.setup();
    const client = clientWith();
    const onAnswered = vi.fn();
    render(<PlayerClaim client={client} clanTag="#TESTCLAN" onAnswered={onAnswered} />);

    await user.click(screen.getByRole("button", { name: "Not in the clan" }));

    expect(client.rpc).toHaveBeenCalledWith("decline_player_link", {});
    expect(onAnswered).toHaveBeenCalledTimes(1);
  });

  it("still offers the guest choice when the roster cannot load", async () => {
    const client = clientWith({ list_linkable_players: { error: { message: "Roster unavailable" } } });
    render(<PlayerClaim client={client} clanTag="#TESTCLAN" onAnswered={vi.fn()} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Roster unavailable");
    expect(screen.getByRole("button", { name: "Not in the clan" })).toBeEnabled();
  });

  it("stays on the screen and says why when a claim is refused", async () => {
    const user = userEvent.setup();
    const client = clientWith({ claim_player: { error: { message: "Player is linked to someone else" } } });
    const onAnswered = vi.fn();
    render(<PlayerClaim client={client} clanTag="#TESTCLAN" onAnswered={onAnswered} />);

    await user.click(await screen.findByRole("button", { name: /Alt/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Player is linked to someone else");
    expect(onAnswered).not.toHaveBeenCalled();
  });
});
