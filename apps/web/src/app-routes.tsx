import { useEffect, useState } from "react";
import { AccessPage } from "./admin/access-page.js";
import { AvailabilityPage } from "./availability/availability-page.js";
import { DashboardPage } from "./dashboard/dashboard-page.js";
import type { DailyDashboardData } from "./dashboard/daily-dashboard.js";
import { approveRecommendation, overrideRecommendation } from "./data/operations.js";

type Role = "leader" | "admin";
type Route = "dashboard" | "availability" | "season" | "access" | "access_denied";

export function routeForPath(hash: string, role: Role): Route {
  if (hash === "#/availability") return "availability";
  if (hash === "#/season") return "season";
  if (hash === "#/access") return role === "admin" ? "access" : "access_denied";
  return "dashboard";
}

export function AppRoutes({ client, clanTag, role, origin, basePath, loadDashboard }: {
  client: any; clanTag: string; role: Role; origin: string; basePath: string; loadDashboard: () => Promise<DailyDashboardData>;
}) {
  const [hash, setHash] = useState(window.location.hash || "#/");
  useEffect(() => {
    const update = () => setHash(window.location.hash || "#/");
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  const route = routeForPath(hash, role);
  if (route === "availability") return <AvailabilityPage client={client} clanTag={clanTag} />;
  if (route === "access") return <AccessPage client={client} origin={`${origin}${basePath}`} />;
  if (route === "access_denied") return <main className="access-shell"><h1>Access unavailable</h1><p>Admin access is required.</p></main>;
  if (route === "season") return <main className="dashboard-shell"><h1>Season details</h1><p>Verified group standings are not available in the normalized data yet.</p></main>;
  return <DashboardPage
    load={loadDashboard}
    onApprove={(recommendationId, changes) => approveRecommendation(client, recommendationId, changes)}
    onOverride={(recommendationId, changes, note) => overrideRecommendation(client, recommendationId, changes, note)}
  />;
}
