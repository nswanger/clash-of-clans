/* The app's three routes, in one place (#25, wave 3; ADR 0002).
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
 *
 * The table, the matcher and the redirects are one module because they are one
 * fact. Splitting the nav's copy from the dispatcher's, as this briefly was,
 * makes adding a route a two-file edit that nothing checks for agreement.
 */

export type AppRouteKey = "cwl" | "members" | "admin";
export type AppRole = "leader" | "admin";

/* `access_denied` is not a route a leader can reach on purpose; it is what
 * `#/admin` resolves to for someone who is not an admin. */
export type Route = AppRouteKey | "access_denied";

export interface RouteEntry {
  key: AppRouteKey;
  label: string;
  href: string;
  adminOnly?: boolean;
}

/* Three after ADR 0002, and Admin is role-conditional — so a leader who is not
 * an admin sees two. Both counts were drawn in the #58 prototype, because a nav
 * that only looks right at three is designed for a user most of the clan is
 * not. */
export const ROUTES: readonly RouteEntry[] = [
  { key: "cwl", label: "CWL", href: "#/cwl" },
  { key: "members", label: "Members", href: "#/members" },
  { key: "admin", label: "Admin", href: "#/admin", adminOnly: true },
];

/* The default route, and the fallback for any path that does not match. */
const DEFAULT_ROUTE: AppRouteKey = "cwl";

export function routesFor(role: AppRole): RouteEntry[] {
  return ROUTES.filter((route) => !route.adminOnly || role === "admin");
}

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
export function routeForPath(hash: string, role: AppRole): Route {
  const path = hash.split("?")[0];
  const match = ROUTES.find((route) => route.href === path);
  if (!match) return DEFAULT_ROUTE;
  if (match.adminOnly && role !== "admin") return "access_denied";
  return match.key;
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
