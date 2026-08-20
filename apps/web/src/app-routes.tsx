/* The dispatcher. What each route IS, which paths redirect, and why three of
 * them were deleted rather than conformed, all live in `routes.ts` beside the
 * table — this file only renders what that module resolves.
 */
import { useEffect, useState } from "react";
import { AdminRoute } from "./admin/admin-route.js";
import { MembersPage } from "./members/members-page.js";
import { CwlRoutePage } from "./cwl/cwl-route.js";
import { redirectForPath, routeForPath, type AppRole } from "./routes.js";

export { redirectForPath, routeForPath } from "./routes.js";

export function AppRoutes({ client, clanTag, role, origin, basePath }: {
  client: any; clanTag: string; role: AppRole; origin: string; basePath: string;
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
