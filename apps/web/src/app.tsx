/* The app's session shell, conformed to Clan Muster (#25, wave 3; #58).
 *
 * Two things used to live here and only one still does. The primary nav is gone:
 * it is the page name in `cm-topbar` now (see app-chrome.tsx), so this component
 * renders no chrome of its own around a signed-in session — it provides the
 * session to the chrome and gets out of the way. What remains is the three auth
 * shells, which are a surface rather than chrome: one route, three states.
 *
 * `.access-shell` is gone with them, and its collision goes too. The sign-in
 * screen and the `#/access` page shared that class while being unrelated
 * surfaces; wave 3 splits them into `auth-` and the Admin route's own page
 * layer.
 */
import { useEffect, useState, type ReactNode } from "react";
import { AppChromeProvider } from "./app-chrome.js";
import { Mark } from "./design/mark.js";
import type { AppRole } from "./routes.js";
import "./auth/auth-shell.css";

export type AppSession =
  | { status: "loading" }
  | { status: "signed_out" }
  | { status: "access_denied"; message: string }
  | { status: "signed_in"; displayName: string; role: AppRole };

/* A placeholder that appears and vanishes inside a tenth of a second is a flash
 * and reads as breakage rather than progress, so a fast resolve shows nothing at
 * all (#43, rule 1). The mark is scheduled, not shown. */
const LOADING_DELAY_MS = 250;

interface AppProps {
  session: AppSession;
  onSignIn?: () => void;
  onSignOut?: () => void;
  children?: ReactNode;
}

export function App({ session, onSignIn, onSignOut, children }: AppProps) {
  const [showLoading, setShowLoading] = useState(false);
  useEffect(() => {
    if (session.status !== "loading") return;
    const timer = setTimeout(() => setShowLoading(true), LOADING_DELAY_MS);
    return () => clearTimeout(timer);
  }, [session.status]);

  if (session.status === "loading") {
    return (
      <main className="auth-shell is-loading" aria-busy="true">
        {showLoading ? <Mark variant="head" className="auth-mark" fill="var(--cm-fg-unknown)" /> : null}
        <p className="auth-live" role="status">Checking your access</p>
      </main>
    );
  }

  if (session.status === "signed_out") {
    return (
      <main className="auth-shell">
        <Mark variant="head" className="auth-mark" fill="var(--cm-accent-fill)" />
        <h1>Clan Muster</h1>
        <p>Sign in with the Discord account connected to your invitation.</p>
        <button className="cm-button is-block" type="button" onClick={onSignIn}>Continue with Discord</button>
      </main>
    );
  }

  /* Absence, not apology: no notice region and no danger colour. Nothing has
     gone wrong — this account simply is not on the list, which is the system
     working. The mark is muted to a neutral for the same reason (#24). */
  if (session.status === "access_denied") {
    return (
      <main className="auth-shell">
        <Mark variant="head" className="auth-mark" fill="var(--cm-fg-unknown)" />
        <h1>Not on the roster</h1>
        <p>{session.message}</p>
        {onSignOut ? <button className="cm-ghost" type="button" onClick={onSignOut}>Sign out</button> : null}
      </main>
    );
  }

  return (
    <AppChromeProvider value={{
      displayName: session.displayName,
      role: session.role,
      onSignOut: () => onSignOut?.(),
    }}>
      {children}
    </AppChromeProvider>
  );
}
