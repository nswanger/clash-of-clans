import { describe, expect, it, vi } from "vitest";
import {
  redeemCallbackInvitation,
  redeemInvitation,
  resolveAppSession,
  signInWithDiscord,
  type AuthClient,
  type SessionClient,
} from "./session.js";

describe("session helpers", () => {
  it("preserves the intended route through Discord sign-in", async () => {
    const signInWithOAuth = vi.fn().mockResolvedValue({ error: null });
    const client = { auth: { signInWithOAuth }, rpc: vi.fn() } satisfies AuthClient;

    await signInWithDiscord(client, "https://ops.example", "#/season", "/clash-of-clans/");

    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: "discord",
      options: { redirectTo: "https://ops.example/clash-of-clans/?authCallback=1&returnTo=%23%2Fseason" },
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

  it("resolves an authenticated admin profile", async () => {
    const client = {
      auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: "user-1" } } }, error: null }) },
      from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { display_name: "Nick" }, error: null }) }) }) }),
      rpc: vi.fn().mockImplementation((name: string) => Promise.resolve({ data: name === "has_app_role" ? true : null, error: null })),
    } satisfies SessionClient;

    await expect(resolveAppSession(client)).resolves.toEqual({ status: "signed_in", displayName: "Nick", role: "admin" });
  });

  it("denies an authenticated user without an active leader role", async () => {
    const client = {
      auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: "user-1" } } }, error: null }) },
      from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { display_name: "Nick" }, error: null }) }) }) }),
      rpc: vi.fn().mockResolvedValue({ data: false, error: null }),
    } satisfies SessionClient;

    await expect(resolveAppSession(client)).resolves.toEqual({
      status: "access_denied",
      message: "Your account does not have active leader access.",
    });
  });

  it("redeems a callback invitation only once per token", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const storage = new Map<string, string>([["pending-invitation", "single-use-token"]]);
    const callbackUrl = "https://ops.example/auth/callback?returnTo=%2Fseason";

    await expect(redeemCallbackInvitation({ auth: { signInWithOAuth: vi.fn() }, rpc }, callbackUrl, storage)).resolves.toBe("/season");
    await redeemCallbackInvitation({ auth: { signInWithOAuth: vi.fn() }, rpc }, callbackUrl, storage);

    expect(rpc).toHaveBeenCalledTimes(1);
    expect([...storage.keys()].join(" ")).not.toContain("single-use-token");
    expect(storage.has("pending-invitation")).toBe(false);
  });

  it("shares one redemption RPC across overlapping callbacks", async () => {
    let finishRedemption!: (value: { error: null }) => void;
    const rpc = vi.fn(() => new Promise<{ error: null }>((resolve) => { finishRedemption = resolve; }));
    const client = { auth: { signInWithOAuth: vi.fn() }, rpc } satisfies AuthClient;
    const storage = new Map<string, string>([["pending-invitation", "overlapping-token"]]);
    const callbackUrl = "https://ops.example/auth/callback?returnTo=%2Fseason";

    const first = redeemCallbackInvitation(client, callbackUrl, storage);
    const second = redeemCallbackInvitation(client, callbackUrl, storage);

    expect(rpc).toHaveBeenCalledTimes(1);
    finishRedemption({ error: null });
    await expect(Promise.all([first, second])).resolves.toEqual(["/season", "/season"]);
  });

  it("allows a failed callback redemption to be retried", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ error: { message: "Temporary redemption failure" } })
      .mockResolvedValueOnce({ error: null });
    const client = { auth: { signInWithOAuth: vi.fn() }, rpc } satisfies AuthClient;
    const storage = new Map<string, string>([["pending-invitation", "retryable-token"]]);
    const callbackUrl = "https://ops.example/auth/callback?returnTo=%2Fseason";

    await expect(redeemCallbackInvitation(client, callbackUrl, storage)).rejects.toThrow("Temporary redemption failure");
    await expect(redeemCallbackInvitation(client, callbackUrl, storage)).resolves.toBe("/season");

    expect(rpc).toHaveBeenCalledTimes(2);
  });
});
