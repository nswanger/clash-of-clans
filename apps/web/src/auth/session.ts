interface AuthError {
  message: string;
}

interface AuthResult {
  error: AuthError | null;
}

export interface AuthClient {
  auth: {
    signInWithOAuth(options: {
      provider: "discord";
      options: { redirectTo: string };
    }): Promise<AuthResult>;
  };
  rpc(name: "redeem_invitation", args: { token: string }): Promise<AuthResult>;
}

export async function signInWithDiscord(client: AuthClient, origin: string, returnTo: string): Promise<void> {
  const callback = new URL("/auth/callback", origin);
  callback.searchParams.set("returnTo", returnTo);
  const { error } = await client.auth.signInWithOAuth({
    provider: "discord",
    options: { redirectTo: callback.toString() },
  });
  if (error) throw new Error(error.message);
}

export async function redeemInvitation(client: AuthClient, token: string): Promise<void> {
  const { error } = await client.rpc("redeem_invitation", { token });
  if (error) throw new Error(error.message);
}
