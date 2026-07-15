import { ACTIVE_CWL_INTERVAL_MS, IDLE_INTERVAL_MS } from "./schedule.js";

export type CollectorLogLevel = "silent" | "error";

export interface CollectorConfig {
  clashApiToken: string;
  clanTag: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  timezone: string;
  logLevel: CollectorLogLevel;
  activeCwlIntervalMs: number;
  idleIntervalMs: number;
}

type Environment = Readonly<Record<string, string | undefined>>;

function positiveInteger(environment: Environment, name: string, fallback: number): number {
  const rawValue = environment[name]?.trim();
  if (!rawValue) return fallback;
  if (!/^\d+$/.test(rawValue) || Number(rawValue) <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return Number(rawValue);
}

export function loadConfig(environment: Environment): CollectorConfig {
  const requiredKeys = [
    "CLASH_API_TOKEN",
    "CLAN_TAG",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "TZ",
  ] as const;
  const missingKeys = requiredKeys.filter((key) => !environment[key]?.trim());
  if (missingKeys.length > 0) {
    throw new Error(`Missing required environment variables: ${missingKeys.join(", ")}`);
  }

  if (!/^#[0289PYLQGRJCUV]+$/.test(environment.CLAN_TAG!.trim())) {
    throw new Error("CLAN_TAG must use valid Clash tag syntax");
  }
  let supabaseUrl: URL;
  try {
    supabaseUrl = new URL(environment.SUPABASE_URL!.trim());
  } catch {
    throw new Error("SUPABASE_URL must be an absolute http(s) URL");
  }
  if (supabaseUrl.protocol !== "http:" && supabaseUrl.protocol !== "https:") {
    throw new Error("SUPABASE_URL must be an absolute http(s) URL");
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: environment.TZ!.trim() }).format();
  } catch {
    throw new Error("TZ must be a valid IANA timezone");
  }
  const logLevel = environment.LOG_LEVEL?.trim() || "error";
  if (logLevel !== "silent" && logLevel !== "error") {
    throw new Error("LOG_LEVEL must be silent or error");
  }

  return {
    clashApiToken: environment.CLASH_API_TOKEN!.trim(),
    clanTag: environment.CLAN_TAG!.trim(),
    supabaseUrl: supabaseUrl.toString().replace(/\/$/, ""),
    supabaseServiceRoleKey: environment.SUPABASE_SERVICE_ROLE_KEY!.trim(),
    timezone: environment.TZ!.trim(),
    logLevel,
    activeCwlIntervalMs: positiveInteger(
      environment,
      "ACTIVE_CWL_INTERVAL_MINUTES",
      ACTIVE_CWL_INTERVAL_MS / (60 * 1_000),
    ) * 60 * 1_000,
    idleIntervalMs: positiveInteger(
      environment,
      "IDLE_INTERVAL_HOURS",
      IDLE_INTERVAL_MS / (60 * 60 * 1_000),
    ) * 60 * 60 * 1_000,
  };
}
