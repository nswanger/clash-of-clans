export interface CollectorConfig {
  clashApiToken: string;
  clanTag: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  timezone: string;
}

type Environment = Readonly<Record<string, string | undefined>>;

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

  return {
    clashApiToken: environment.CLASH_API_TOKEN!.trim(),
    clanTag: environment.CLAN_TAG!.trim(),
    supabaseUrl: supabaseUrl.toString().replace(/\/$/, ""),
    supabaseServiceRoleKey: environment.SUPABASE_SERVICE_ROLE_KEY!.trim(),
    timezone: environment.TZ!.trim(),
  };
}
