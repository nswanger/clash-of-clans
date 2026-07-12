import { describe, expect, it, vi } from "vitest";
import { redeemInvitation, signInWithDiscord, type AuthClient } from "./session.js";

describe("session helpers", () => {
  it("preserves the intended route through Discord sign-in", async () => {
    const signInWithOAuth = vi.fn().mockResolvedValue({ error: null });
    const client = { auth: { signInWithOAuth }, rpc: vi.fn() } satisfies AuthClient;

    await signInWithDiscord(client, "https://ops.example", "/season");

    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: "discord",
      options: { redirectTo: "https://ops.example/auth/callback?returnTo=%2Fseason" },
    });
  });

  it("redeems an invitation through the protected database function", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const client = { auth: { signInWithOAuth: vi.fn() }, rpc } satisfies AuthClient;

    await redeemInvitation(client, "single-use-token");

    expect(rpc).toHaveBeenCalledWith("redeem_invitation", { token: "single-use-token" });
  });

  it("surfaces invitation redemption failures", async () => {
    const client = {
      auth: { signInWithOAuth: vi.fn() },
      rpc: vi.fn().mockResolvedValue({ error: { message: "Invitation is invalid, expired, or already used" } }),
    } satisfies AuthClient;

    await expect(redeemInvitation(client, "used-token")).rejects.toThrow("Invitation is invalid, expired, or already used");
  });
});
