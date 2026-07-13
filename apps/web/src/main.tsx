import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createClient } from "@supabase/supabase-js";
import { LiveApp } from "./auth/live-app.js";
import { loadDashboardSnapshot } from "./dashboard/dashboard-loader.js";
import { mapDashboardData } from "./dashboard/dashboard-model.js";
import type { LiveSessionClient } from "./auth/live-app.js";
import type { DashboardDataClient } from "./dashboard/dashboard-loader.js";
import { AppRoutes } from "./app-routes.js";
import { createE2EClient } from "./test/e2e-client.js";
import "./styles.css";

const root = document.querySelector<HTMLDivElement>("#root");
if (!root) throw new Error("Application root element is missing");

const e2eMode = import.meta.env.VITE_E2E_MODE === "true";
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const clanTag = import.meta.env.VITE_CLAN_TAG;
if (!e2eMode && (!supabaseUrl || !supabaseAnonKey || !clanTag)) throw new Error("VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, and VITE_CLAN_TAG are required");
const supabase = e2eMode ? createE2EClient() : createClient(supabaseUrl, supabaseAnonKey);
const activeClanTag = e2eMode ? "#E2E" : clanTag;
const loadDashboard = () => loadDashboardSnapshot(supabase as unknown as DashboardDataClient, activeClanTag).then(mapDashboardData);

createRoot(root).render(
  <StrictMode>
    <LiveApp client={supabase as unknown as LiveSessionClient} location={window.location} basePath={import.meta.env.BASE_URL}>
      {(session) => <AppRoutes client={supabase} clanTag={activeClanTag} role={session.role} origin={window.location.origin} basePath={import.meta.env.BASE_URL} loadDashboard={loadDashboard} />}
    </LiveApp>
  </StrictMode>,
);
