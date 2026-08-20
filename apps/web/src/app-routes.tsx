/* The app's three routes (#25, wave 3; ADR 0002).
 *
 * It was six. `#/overview`, `#/season` and `#/dashboard` are DELETED rather than
 * conformed, under one rule: ONE ROUTE PER QUESTION A LEADER ACTUALLY ASKS.
 *
 * - `#/overview` failed it by duplication — four metrics under labels identical
 *   to the members roster's summary strip, off the same source, plus a callout
 *   linking to the roster. Two pages showing the same numbers, one of which
 *   existed only to link to the other. It redirects to `#/members`.
 * - `#/season` failed it by having no content, and the stub's blocker is real
 *   and unfixable from the current schema: only `opponent_tag` is collected and
 *   there is no league-group standings data anywhere.
 * - `#/dashboard` failed it as a grab bag. Its roster and summary duplicated the
 *   other two routes; its recommendations and lineup history describe only the
 *   current cycle and were judged not worth a surface; its collection health was
 *   the one real thing and moved to Admin.
 *
 * `#/cwl-lineup` becomes `#/cwl` because it is no longer only a lineup — it
 * carries the phase now — and `#/access` widens into `#/admin`. Both old paths
 * redirect, because both were linkable and one of them is in the runbook.
 */
import { useEffect, useState } from "react";
import { AdminRoute } from "./admin/admin-route.js";
import { MembersPage } from "./members/members-page.js";
import { CwlRoutePage } from "./cwl/cwl-route.js";

type Role = "leader" | "admin";
export type Route = "members" | "admin" | "cwl" | "access_denied";

/* The old paths, and where each one goes. `#/season` and `#/dashboard` are
 * absent deliberately: they redirect nowhere in particular because they answered
 * no question, so they fall through to the default route like any other unknown
 * path. Only the two that had a successor get one. */
const REDIRECTS: Record<string, string> = {
  "#/overview": "#/members",
  "#/cwl-lineup": "#/cwl",
  "#/access": "#/admin",
};

/* The path only. The phase travels as a query parameter on `#/cwl` (ADR 0002),
 * which this has always tolerated. */
export function routeForPath(hash: string, role: Role): Route {
  const path = hash.split("?")[0];
  if (path === "#/members") return "members";
  if (path === "#/cwl") return "cwl";
  if (path === "#/admin") return role === "admin" ? "admin" : "access_denied";
  return "cwl";
}

/* Returns the hash a stale link should be replaced with, preserving the query
 * string so a bookmarked `#/cwl-lineup?phase=review` still lands on the phase it
 * named. */
export function redirectForPath(hash: string): string | undefined {
  const [path, query] = hash.split("?");
  const target = REDIRECTS[path ?? ""];
  if (!target) return undefined;
  return query ? `${target}?${query}` : target;
}

export function AppRoutes({ client, clanTag, role, origin, basePath }: {
  client: any; clanTag: string; role: Role; origin: string; basePath: string;
}) {
  const [hash, setHash] = useState(window.location.hash || "#/");
  useEffect(() => {
    const update = () => setHash(window.location.hash || "#/");
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);

  /* `replace`, not an assignment: a deleted route must not sit in the history
     stack, or Back from `#/members` returns to `#/overview` and bounces. */
  const redirect = redirectForPath(hash);
  useEffect(() => {
    if (redirect) window.location.replace(`${window.location.pathname}${window.location.search}${redirect}`);
  }, [redirect]);
  if (redirect) return null;

  const route = routeForPath(hash, role);
  if (route === "members") return <MembersPage client={client} clanTag={clanTag} />;
  if (route === "admin") return <AdminRoute client={client} origin={`${origin}${basePath}`} />;
  /* Absence, not apology — the same shape as the signed-out shell. Nothing has
     gone wrong; this account is simply not an admin. */
  if (route === "access_denied") {
    return <main className="auth-shell">
      <h1>Admin only</h1>
      <p>Ask an admin to widen your access, then open this page again.</p>
    </main>;
  }
  return <CwlRoutePage client={client} clanTag={clanTag} hash={hash} />;
}
