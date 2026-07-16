const CURRENT_SECRET_PREFIX = "sb_secret_";

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function isLegacyServiceRoleJwt(key: string): boolean {
  const segments = key.split(".");
  if (segments.length !== 3 || !segments.every(Boolean)) return false;

  try {
    const payload = JSON.parse(decodeBase64Url(segments[1]!)) as { role?: unknown };
    return payload.role === "service_role";
  } catch {
    return false;
  }
}

export function isSupportedSupabaseServerKey(key: string): boolean {
  return (
    (key.startsWith(CURRENT_SECRET_PREFIX) && key.length > CURRENT_SECRET_PREFIX.length)
    || isLegacyServiceRoleJwt(key)
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
