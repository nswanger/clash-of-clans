interface AuthError {
  message: string;
}

interface AuthResult {
  error: AuthError | null;
}

export type ResolvedAppSession =
  | { status: "signed_out" }
  | { status: "access_denied"; message: string }
  /* `isOperator` is orthogonal to `role` (#117): it decides who sees the
   * Collector section of Admin and is never a route in by itself. */
  | { status: "signed_in"; displayName: string; role: "leader" | "admin"; isOperator: boolean };

interface QueryResult<T> { data: T; error: AuthError | null }

interface QueryBuilder<T> {
  select(columns: string): QueryBuilder<T>;
  eq(column: string, value: string): QueryBuilder<T> & PromiseLike<QueryResult<T>>;
  single(): Promise<QueryResult<T>>;
}

export interface SessionClient {
  auth: {
    getSession(): Promise<{ data: { session: { user: { id: string } } | null }; error: AuthError | null }>;
  };
  from(table: "profiles"): QueryBuilder<{ display_name: string }>;
  rpc(name: "has_app_role", args: { required_role: "leader" | "admin" | "operator" }): Promise<QueryResult<boolean>>;
}

interface RedemptionStorage {
  get(key: string): string | undefined | null;
  set(key: string, value: string): unknown;
  delete?(key: string): unknown;
}

const pendingInvitationRedemptions = new Map<string, Promise<void>>();

export interface AuthClient {
  auth: {
    signInWithOAuth(options: {
      provider: "discord";
      options: { redirectTo: string };
    }): Promise<AuthResult>;
  };
  rpc(name: "redeem_invitation", args: { token: string }): Promise<AuthResult>;
}

/* Its own interface rather than a method on `AuthClient`: signing out needs
 * nothing that signing in needs, and widening `AuthClient` would make every
 * caller and every test stub a method it never reaches. */
export interface SignOutClient {
  auth: { signOut(): Promise<AuthResult> };
}

export async function signInWithDiscord(client: AuthClient, origin: string, returnTo: string, basePath = "/"): Promise<void> {
  const callback = new URL(basePath, origin);
  callback.searchParams.set("authCallback", "1");
  callback.searchParams.set("returnTo", returnTo);
  const { error } = await client.auth.signInWithOAuth({
    provider: "discord",
    options: { redirectTo: callback.toString() },
  });
  if (error) throw new Error(error.message);
}

/* The app had no route to sign out at all until #58 gave the display name an
 * affordance. There is nothing to clean up beyond the Supabase session: the
 * auth state change this fires is what `LiveApp` already listens to, so the
 * signed-out shell arrives through the same path a revoked session does rather
 * than through a second one. */
export async function signOut(client: SignOutClient): Promise<void> {
  const { error } = await client.auth.signOut();
  if (error) throw new Error(error.message);
}

export async function redeemInvitation(client: AuthClient, token: string): Promise<void> {
  const { error } = await client.rpc("redeem_invitation", { token });
  if (error) throw new Error(error.message);
}

export async function resolveAppSession(client: SessionClient): Promise<ResolvedAppSession> {
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw new Error(sessionError.message);
  if (!sessionData.session) return { status: "signed_out" };

  const userId = sessionData.session.user.id;
  const [profileResult, adminResult, leaderResult, operatorResult] = await Promise.all([
    client.from("profiles").select("display_name").eq("id", userId).single(),
    client.rpc("has_app_role", { required_role: "admin" }),
    client.rpc("has_app_role", { required_role: "leader" }),
    client.rpc("has_app_role", { required_role: "operator" }),
  ]);
  if (profileResult.error) throw new Error(profileResult.error.message);
  if (adminResult.error) throw new Error(adminResult.error.message);
  if (leaderResult.error) throw new Error(leaderResult.error.message);
  if (operatorResult.error) throw new Error(operatorResult.error.message);

  const role = adminResult.data ? "admin" : leaderResult.data ? "leader" : undefined;
  if (!role) return { status: "access_denied", message: "Your account does not have active leader access." };
  return { status: "signed_in", displayName: profileResult.data.display_name, role, isOperator: operatorResult.data === true };
}

export async function redeemCallbackInvitation(
  client: AuthClient,
  callbackUrl: string,
  storage: RedemptionStorage,
): Promise<string | undefined> {
  const callback = new URL(callbackUrl);
  const token = callback.searchParams.get("invitation") ?? storage.get("pending-invitation");
  const candidateReturnTo = callback.searchParams.get("returnTo") ?? undefined;
  const returnTo = candidateReturnTo?.startsWith("/") || candidateReturnTo?.startsWith("#/") ? candidateReturnTo : undefined;
  if (!token) return returnTo;
  let tokenFingerprint = 2166136261;
  for (const character of token) tokenFingerprint = Math.imul(tokenFingerprint ^ character.charCodeAt(0), 16777619);
  const redemptionKey = `invitation-redemption:${(tokenFingerprint >>> 0).toString(16)}`;
  if (storage.get(redemptionKey) === "complete") return returnTo;
  let pendingRedemption = pendingInvitationRedemptions.get(redemptionKey);
  if (!pendingRedemption) {
    pendingRedemption = redeemInvitation(client, token);
    pendingInvitationRedemptions.set(redemptionKey, pendingRedemption);
  }
  try {
    await pendingRedemption;
  } finally {
    if (pendingInvitationRedemptions.get(redemptionKey) === pendingRedemption) {
      pendingInvitationRedemptions.delete(redemptionKey);
    }
  }
  storage.delete?.("pending-invitation");
  storage.set(redemptionKey, "complete");
  return returnTo;
}
