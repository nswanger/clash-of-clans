/* The app chrome (#58), which belonged to no wave until this one.
 *
 * Spec: design/prototype/app-chrome.html, variant B. It is the second surface
 * in this migration designed rather than ported, and the second real test of the
 * component inventory — which it passed differently from the review phase:
 * where that one needed no new component, this one needed exactly the two the
 * inventory had already recorded as missing (`cm-button`, `cm-account`) and
 * nothing else.
 *
 * THERE IS NO APP BAR. The primary nav is the page's own `h1`: pressing the
 * page name discloses the three routes. That is what makes the chrome free —
 * `cm-topbar` is already on every surface, so navigation adds no band of chrome
 * to a phone-first tool, and both rejected alternatives failed on exactly that
 * cost. A bottom tab set needs a slim app bar above it to carry the mark, and
 * contends for the bottom edge `cm-actionbar` already owns on the default
 * route. A top rail measurably does not fit at 375px once the mark, the product
 * name, three links and the account control share a line — the last link clips.
 *
 * The trade is real and was accepted knowingly: NAVIGATION IS BEHIND A TAP.
 * Three destinations, one role-conditional and one visited monthly, is not a set
 * that needs to be on screen at all times — but a leader who has not been shown
 * the affordance has to find it.
 *
 * This is app chrome rather than a page, so it renders no `cm-shell` and owns no
 * data. Each surface renders its own `AppTopbar` with its own eyebrow, title and
 * side slot, because the eyebrow and the side controls are the surface's — the
 * lineup's lock chip and day menu are not the review phase's season menu.
 */
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "./design/icon.js";
import { Mark } from "./design/mark.js";

export type AppRouteKey = "cwl" | "members" | "admin";
export type AppRole = "leader" | "admin";

interface RouteEntry { key: AppRouteKey; label: string; href: string; adminOnly?: boolean }

/* Three after ADR 0002, and Admin is role-conditional — so a leader who is not
 * an admin sees two. Both counts were drawn in the prototype, because a nav that
 * only looks right at three is designed for a user most of the clan is not. */
const ROUTES: RouteEntry[] = [
  { key: "cwl", label: "CWL", href: "#/cwl" },
  { key: "members", label: "Members", href: "#/members" },
  { key: "admin", label: "Admin", href: "#/admin", adminOnly: true },
];

export function routesFor(role: AppRole): RouteEntry[] {
  return ROUTES.filter((route) => !route.adminOnly || role === "admin");
}

export interface AppChrome {
  displayName: string;
  role: AppRole;
  onSignOut: () => void;
}

/* Context rather than props threaded through every surface. The chrome's three
 * facts belong to the session, which `App` owns, and the surfaces that render
 * the topbar are two levels below it — passing them down would put the session
 * in the signature of every page that happens to have a header. */
const AppChromeContext = createContext<AppChrome | null>(null);

export function AppChromeProvider({ value, children }: { value: AppChrome; children: ReactNode }) {
  return <AppChromeContext.Provider value={value}>{children}</AppChromeContext.Provider>;
}

/* Absent chrome is not an error: a surface rendered in a test without a provider
 * should draw its own header and skip the nav rather than throw. */
export function useAppChrome(): AppChrome | null {
  return useContext(AppChromeContext);
}

/* Both topbar disclosures close on Escape and on a press outside themselves,
 * which is the behaviour every menu in the app already has. */
function useDismissable(open: boolean, close: () => void) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    const onPointerDown = (event: Event) => {
      if (!ref.current?.contains(event.target as Node)) close();
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [close, open]);
  return ref;
}

function RouteControl({ route, eyebrow, title, role }: {
  route: AppRouteKey;
  eyebrow: ReactNode;
  title: string;
  role: AppRole;
}) {
  const [open, setOpen] = useState(false);
  const ref = useDismissable(open, () => setOpen(false));
  return (
    <span className="cm-grow" style={{ position: "relative" }} ref={ref}>
      <button
        className="cm-routebutton"
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span>
          <p className="cm-eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
        </span>
        {/* Rotated down and up rather than flipped end for end: 180deg points the
            chevron back at the page name, which reads as "go back". */}
        <span className="cm-routebutton-chev" aria-hidden="true"><Icon name="chevron" /></span>
      </button>
      {open
        ? <nav className="cm-routemenu" aria-label="Primary">
            {routesFor(role).map((entry) => <a
              key={entry.key}
              href={entry.href}
              {...(entry.key === route ? { "aria-current": "page" as const } : {})}
              onClick={() => setOpen(false)}
            >{entry.label}</a>)}
          </nav>
        : null}
    </span>
  );
}

/* The display name was a bare `<span>` in the old bar: no affordance, and no
 * route to sign out anywhere in the app. The initial travels and the name stays
 * the accessible name, because the name is the widest unbounded string in the
 * chrome and the one piece of it nobody reads twice. */
function AccountControl({ displayName, onSignOut }: { displayName: string; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useDismissable(open, () => setOpen(false));
  const initial = [...displayName.trim()][0]?.toLocaleUpperCase() ?? "?";
  return (
    <span style={{ position: "relative" }} ref={ref}>
      <button
        className="cm-account"
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${displayName} — account and sign out`}
        onClick={() => setOpen((current) => !current)}
      ><span aria-hidden="true">{initial}</span></button>
      {open
        ? <div className="cm-routemenu is-trailing" role="menu">
            <button type="button" role="menuitem" onClick={() => { setOpen(false); onSignOut(); }}>Sign out</button>
          </div>
        : null}
    </span>
  );
}

/* The topbar every surface renders. `children` is `cm-topbar-side` — the
 * surface's own chips and overflow menu — and it sits between the flexible
 * middle and the account control, which is the fourth slot #58 gave the bar. */
export function AppTopbar({ route, eyebrow, title, children }: {
  route: AppRouteKey;
  eyebrow: ReactNode;
  title: string;
  children?: ReactNode;
}) {
  const chrome = useAppChrome();
  if (!chrome) {
    return <header className="cm-topbar">
      <div className="cm-grow"><p className="cm-eyebrow">{eyebrow}</p><h1>{title}</h1></div>
      {children}
    </header>;
  }
  return (
    <header className="cm-topbar">
      {/* Once per screen, and the shield rather than the bare head: the container
          is what survives shrinking, and 24px is inside the band it was drawn
          for (#24). */}
      <Mark variant="shield" className="cm-mark" fill="var(--cm-accent-fill)" />
      <RouteControl route={route} eyebrow={eyebrow} title={title} role={chrome.role} />
      {children}
      <AccountControl displayName={chrome.displayName} onSignOut={chrome.onSignOut} />
    </header>
  );
}
