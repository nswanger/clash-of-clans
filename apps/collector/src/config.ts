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

  return {
    clashApiToken: environment.CLASH_API_TOKEN!.trim(),
    clanTag: environment.CLAN_TAG!.trim(),
    supabaseUrl: environment.SUPABASE_URL!.trim(),
    supabaseServiceRoleKey: environment.SUPABASE_SERVICE_ROLE_KEY!.trim(),
    timezone: environment.TZ!.trim(),
  };
}
