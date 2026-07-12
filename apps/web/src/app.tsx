import type { ReactNode } from "react";

export type AppSession =
  | { status: "signed_out" }
  | { status: "signed_in"; displayName: string; role: "leader" | "admin" };

interface AppProps {
  session: AppSession;
  onSignIn?: () => void;
  children?: ReactNode;
}

export function App({ session, onSignIn, children }: AppProps) {
  if (session.status === "signed_out") {
    return (
      <main className="access-shell">
        <p className="eyebrow">Ironwood War Ops</p>
        <h1>Leader access</h1>
        <p>Sign in with the Discord account connected to your invitation.</p>
        <button className="primary-button" type="button" onClick={onSignIn}>Continue with Discord</button>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <nav aria-label="Primary">
        <a href="/">Today</a>
        <a href="/availability">Availability</a>
        <a href="/season">Season</a>
        {session.role === "admin" ? <a href="/access">Access</a> : null}
        <span>{session.displayName}</span>
      </nav>
      {children ?? <main><h1>Daily command</h1></main>}
    </div>
  );
}
