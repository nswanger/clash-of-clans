import { describe, expect, it, vi } from "vitest";
import {
  redeemCallbackInvitation,
  redeemInvitation,
  resolveAppSession,
  signInWithDiscord,
  type AuthClient,
  type SessionClient,
} from "./session.js";

/* `profiles` answers `.single()`; `profile_player_links` is awaited straight
   off `.eq()`, the way the supabase builder is a thenable. */
function sessionTables({ declinedAt = null, linkedTags = ["#MAIN"] }: { declinedAt?: string | null; linkedTags?: string[] } = {}) {
  return vi.fn((table: string) => ({
    select: () => ({
      eq: () => table === "profiles"
        ? { single: () => Promise.resolve({ data: { display_name: "Nick", player_link_declined_at: declinedAt }, error: null }) }
        : Promise.resolve({ data: linkedTags.map((player_tag) => ({ player_tag })), error: null }),
    }),
  })) as unknown as SessionClient["from"];
}

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
      from: sessionTables(),
      rpc: vi.fn().mockImplementation((name: string) => Promise.resolve({ data: name === "has_app_role" ? true : null, error: null })),
    } satisfies SessionClient;

    await expect(resolveAppSession(client)).resolves.toEqual({ status: "signed_in", displayName: "Nick", role: "admin", isOperator: true, needsPlayerChoice: false });
  });

  /* #117: operator is asked for beside admin and leader, and it is orthogonal to
     `role` — an admin without it is an admin, an operator without either is
     nobody. */
  it("resolves the operator role beside the access role", async () => {
    const client = {
      auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: "user-1" } } }, error: null }) },
      from: sessionTables(),
      rpc: vi.fn().mockImplementation((_name: string, args: { required_role: string }) =>
        Promise.resolve({ data: args.required_role === "admin", error: null })),
    } satisfies SessionClient;

    await expect(resolveAppSession(client)).resolves.toEqual({ status: "signed_in", displayName: "Nick", role: "admin", isOperator: false, needsPlayerChoice: false });
    expect(client.rpc).toHaveBeenCalledWith("has_app_role", { required_role: "operator" });
  });

  /* #134: the claim screen is owed exactly when there is neither a link nor a
     guest choice. Either one answers it. */
  it.each([
    { linkedTags: [], declinedAt: null, needsPlayerChoice: true },
    { linkedTags: ["#MAIN"], declinedAt: null, needsPlayerChoice: false },
    { linkedTags: [], declinedAt: "2026-10-31T12:00:00Z", needsPlayerChoice: false },
  ])("asks for a player when links=$linkedTags and declined=$declinedAt", async ({ linkedTags, declinedAt, needsPlayerChoice }) => {
    const client = {
      auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: "user-1" } } }, error: null }) },
      from: sessionTables({ linkedTags, declinedAt }),
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
    } satisfies SessionClient;

    await expect(resolveAppSession(client)).resolves.toMatchObject({ status: "signed_in", needsPlayerChoice });
  });

  it("denies an account that holds only the operator role", async () => {
    const client = {
      auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: "user-1" } } }, error: null }) },
      from: sessionTables(),
      rpc: vi.fn().mockImplementation((_name: string, args: { required_role: string }) =>
        Promise.resolve({ data: args.required_role === "operator", error: null })),
    } satisfies SessionClient;

    await expect(resolveAppSession(client)).resolves.toMatchObject({ status: "access_denied" });
  });

  it("denies an authenticated user without an active leader role", async () => {
    const client = {
      auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: "user-1" } } }, error: null }) },
      from: sessionTables(),
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
