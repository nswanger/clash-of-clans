const CURRENT_SECRET_PREFIX = "sb_secret_";

function isLegacyJwt(key: string): boolean {
  const segments = key.split(".");
  return segments.length === 3 && segments.every(Boolean);
}

export function isSupportedSupabaseServerKey(key: string): boolean {
  return (
    (key.startsWith(CURRENT_SECRET_PREFIX) && key.length > CURRENT_SECRET_PREFIX.length)
    || isLegacyJwt(key)
  );
}

export function buildSupabaseRequestHeaders(
  key: string,
  prefer?: string,
): Record<string, string> {
  return {
    apikey: key,
    ...(key.startsWith(CURRENT_SECRET_PREFIX) ? {} : { authorization: `Bearer ${key}` }),
    "content-type": "application/json",
    ...(prefer ? { prefer } : {}),
  };
}
