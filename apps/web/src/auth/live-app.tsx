import { useEffect, useState, type ReactNode } from "react";
import { App, type AppSession } from "../app.js";
import {
  redeemCallbackInvitation,
  resolveAppSession,
  signInWithDiscord,
  type AuthClient,
  type SessionClient,
} from "./session.js";

interface AuthSubscription {
  data: { subscription: { unsubscribe(): void } };
}

export interface LiveSessionClient extends Omit<AuthClient, "rpc">, Omit<SessionClient, "rpc"> {
  auth: AuthClient["auth"] & SessionClient["auth"] & {
    onAuthStateChange(callback: () => void): AuthSubscription;
  };
  rpc(name: "redeem_invitation", args: { token: string }): Promise<{ error: { message: string } | null }>;
  rpc(name: "has_app_role", args: { required_role: "leader" | "admin" }): Promise<{ data: boolean; error: { message: string } | null }>;
}

interface BrowserLocation {
  href: string;
  origin: string;
  pathname: string;
}

interface LiveAppProps {
  client: LiveSessionClient;
  location: BrowserLocation;
  children?: ReactNode | ((session: Extract<AppSession, { status: "signed_in" }>) => ReactNode);
  navigation?: { replaceState(path: string): void; assign(path: string): void };
  basePath?: string;
}

const defaultNavigation = {
  replaceState: (path: string) => window.history.replaceState(null, "", path),
  assign: (path: string) => window.location.assign(path),
};

function browserRedemptionStorage() {
  return {
    get: (key: string) => window.sessionStorage.getItem(key),
    set: (key: string, value: string) => window.sessionStorage.setItem(key, value),
    delete: (key: string) => window.sessionStorage.removeItem(key),
  };
}

export function LiveApp({ client, location, children, navigation = defaultNavigation, basePath = "/" }: LiveAppProps) {
  const [session, setSession] = useState<AppSession>({ status: "loading" });

  useEffect(() => {
    let active = true;
    const loadSession = async () => {
      try {
        const currentSession = await client.auth.getSession();
        if (currentSession.error) throw new Error(currentSession.error.message);
        if (!currentSession.data.session) {
          if (active) setSession({ status: "signed_out" });
          return;
        }
        const returnTo = await redeemCallbackInvitation(client, location.href, browserRedemptionStorage());
        if (new URL(location.href).searchParams.get("authCallback") === "1") navigation.replaceState(`${basePath}${returnTo?.startsWith("#/") ? returnTo : "#/"}`);
        const nextSession = await resolveAppSession(client);
        if (active) setSession(nextSession);
      } catch (error) {
        if (active) setSession({
          status: "access_denied",
          message: error instanceof Error ? error.message : "Unable to verify your access.",
        });
      }
    };

    void loadSession();
    const { data } = client.auth.onAuthStateChange(() => void loadSession());
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [basePath, client, location.href, navigation]);

  return (
    <App
      session={session}
      onSignIn={() => {
        const currentUrl = new URL(location.href);
        const invitation = currentUrl.searchParams.get("invitation");
        if (invitation) window.sessionStorage.setItem("pending-invitation", invitation);
        void signInWithDiscord(client, location.origin, currentUrl.hash || "#/", basePath);
      }}
    >
      {session.status === "signed_in" && typeof children === "function" ? children(session) : typeof children === "function" ? null : children}
    </App>
  );
}
