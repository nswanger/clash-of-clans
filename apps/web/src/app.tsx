import type { ReactNode } from "react";

export type AppSession =
  | { status: "loading" }
  | { status: "signed_out" }
  | { status: "access_denied"; message: string }
  | { status: "signed_in"; displayName: string; role: "leader" | "admin" };

interface AppProps {
  session: AppSession;
  onSignIn?: () => void;
  children?: ReactNode;
}

export function App({ session, onSignIn, children }: AppProps) {
  if (session.status === "loading") {
    return <main className="access-shell"><p role="status">Loading your war room…</p></main>;
  }

  if (session.status === "signed_out") {
    return (
      <main className="access-shell">
        <p className="eyebrow">CWL War Ops</p>
        <h1>Leader access</h1>
        <p>Sign in with the Discord account connected to your invitation.</p>
        <button className="primary-button" type="button" onClick={onSignIn}>Continue with Discord</button>
      </main>
    );
  }

  if (session.status === "access_denied") {
    return (
      <main className="access-shell">
        <p className="eyebrow">CWL War Ops</p>
        <h1>Access unavailable</h1>
        <p>{session.message}</p>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <nav aria-label="Primary">
        <a href="#/overview">Overview</a>
        <a href="#/members">Members</a>
        <a href="#/">CWL Today</a>
        <a href="#/availability">Availability</a>
        <a href="#/season">Season</a>
        {session.role === "admin" ? <a href="#/access">Access</a> : null}
        <span>{session.displayName}</span>
      </nav>
      {children ?? <main><h1>Daily command</h1></main>}
    </div>
  );
}
