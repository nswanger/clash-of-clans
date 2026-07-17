#!/bin/sh
set -eu

container_name=${COLLECTOR_CONTAINER_NAME:-cwl-collector}
log_lines=${COLLECTOR_LOG_LINES:-80}
verification_failed=0

if ! command -v docker >/dev/null 2>&1; then
  printf 'Docker is required to verify the collector.\n' >&2
  exit 1
fi

container_running=$(docker inspect --format '{{.State.Running}}' "$container_name" 2>/dev/null || printf 'false')
container_health=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}' "$container_name" 2>/dev/null || printf 'missing')

printf 'Container: %s\n' "$container_name"
printf 'Container running: %s\n' "$container_running"
printf 'Container health: %s\n' "$container_health"

if [ "$container_running" != 'true' ] || [ "$container_health" != 'healthy' ]; then
  verification_failed=1
fi

printf '\nRecent logs (sanitized):\n'
docker logs --tail "$log_lines" "$container_name" 2>&1 | awk '
  {
    gsub(/(CLASH_API_TOKEN|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY|CLAN_TAG|PLAYER_TAG|clan_tag|player_tag)=[^[:space:]]+/, "<redacted-env>")
    gsub(/sb_secret_[A-Za-z0-9_-]+/, "<redacted>")
    gsub(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/, "<redacted-jwt>")
    gsub(/Bearer [A-Za-z0-9._-]+/, "Bearer <redacted>")
    gsub(/#[A-Z0-9][A-Z0-9][A-Z0-9]+/, "<redacted-tag>")
    print
  }
'

set +e
metrics_output=$(docker exec -i "$container_name" node --input-type=module 2>&1 <<'NODE'
const requiredEnvironmentVariables = [
  "CLASH_API_TOKEN",
  "CLAN_TAG",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
];

const missingEnvironmentVariables = requiredEnvironmentVariables.filter(
  (name) => !process.env[name]?.trim(),
);

if (missingEnvironmentVariables.length > 0) {
  console.log("CLASH_CONNECTIVITY=not_checked");
  console.log("SUPABASE_CONNECTIVITY=not_checked");
  console.error(`Missing collector environment: ${missingEnvironmentVariables.join(", ")}`);
  process.exit(1);
}

const supabaseUrl = process.env.SUPABASE_URL.replace(/\/$/, "");
const { buildSupabaseRequestHeaders } = await import("./dist/supabase-auth.js");
const supabaseHeaders = buildSupabaseRequestHeaders(process.env.SUPABASE_SERVICE_ROLE_KEY);

function printMetric(name, value) {
  console.log(`${name}=${value ?? "none"}`);
}

async function fetchSupabase(path, extraHeaders = {}) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    headers: { ...supabaseHeaders, ...extraHeaders },
  });
  if (!response.ok) {
    throw new Error(`Supabase request failed (${response.status})`);
  }
  return response;
}

async function fetchRows(table, fields) {
  const pageSize = 1000;
  const rows = [];
  for (let start = 0; ; start += pageSize) {
    const response = await fetchSupabase(
      `${table}?select=${fields.join(",")}`,
      { Range: `${start}-${start + pageSize - 1}` },
    );
    const page = await response.json();
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

function countDuplicateKeys(rows, fields) {
  const seen = new Set();
  let duplicates = 0;
  for (const row of rows) {
    const key = fields.map((field) => row[field]).join("\u001f");
    if (seen.has(key)) duplicates += 1;
    else seen.add(key);
  }
  return duplicates;
}

let verificationFailed = false;

try {
  const clashResponse = await fetch(
    `https://api.clashofclans.com/v1/clans/${encodeURIComponent(process.env.CLAN_TAG)}`,
    { headers: { authorization: `Bearer ${process.env.CLASH_API_TOKEN}` } },
  );
  printMetric("CLASH_CONNECTIVITY", clashResponse.ok ? "ok" : `http_${clashResponse.status}`);
  verificationFailed ||= !clashResponse.ok;
} catch {
  printMetric("CLASH_CONNECTIVITY", "network_error");
  verificationFailed = true;
}

try {
  const [latestSnapshotResponse, latestRunResponse, latestSeasonResponse] = await Promise.all([
    fetchSupabase("raw_snapshots?select=collected_at&order=collected_at.desc&limit=1"),
    fetchSupabase("collection_runs?select=id,status,started_at,last_fresh_at&status=neq.running&order=started_at.desc&limit=1"),
    fetchSupabase("cwl_seasons?select=clan_tag,season_id&order=season_id.desc&limit=1"),
  ]);

  const latestSnapshots = await latestSnapshotResponse.json();
  const latestRuns = await latestRunResponse.json();
  const latestSeasons = await latestSeasonResponse.json();
  const latestSeason = latestSeasons[0];

  let canonicalWarCount = 0;
  let canonicalMemberCount = 0;
  if (latestSeason) {
    const filters = `clan_tag=eq.${encodeURIComponent(latestSeason.clan_tag)}&season_id=eq.${encodeURIComponent(latestSeason.season_id)}`;
    const [wars, members] = await Promise.all([
      fetchSupabase(`cwl_wars?select=war_tag&${filters}`),
      fetchSupabase(`cwl_members?select=player_tag&${filters}`),
    ]);
    canonicalWarCount = (await wars.json()).length;
    canonicalMemberCount = (await members.json()).length;
  }

  const identityChecks = [
    ["cwl_seasons", ["clan_tag", "season_id"]],
    ["cwl_members", ["clan_tag", "season_id", "player_tag"]],
    ["cwl_wars", ["war_tag"]],
    ["cwl_wars", ["clan_tag", "season_id", "war_day"]],
    ["cwl_war_members", ["war_tag", "player_tag"]],
    ["cwl_war_members", ["war_tag", "map_position"]],
    ["cwl_attacks", ["war_tag", "attacker_tag", "attack_order"]],
  ];

  let duplicateCanonicalIdentities = 0;
  for (const [table, fields] of identityChecks) {
    duplicateCanonicalIdentities += countDuplicateKeys(await fetchRows(table, fields), fields);
  }

  printMetric("SUPABASE_CONNECTIVITY", "ok");
  printMetric("LATEST_RAW_SNAPSHOT_AT", latestSnapshots[0]?.collected_at);
  printMetric("CANONICAL_WAR_COUNT", canonicalWarCount);
  printMetric("CANONICAL_MEMBER_COUNT", canonicalMemberCount);
  printMetric("COLLECTION_HEALTH", latestRuns[0]?.status);
  printMetric("COLLECTION_LAST_FRESH_AT", latestRuns[0]?.last_fresh_at);
  printMetric("COLLECTION_RUN_ID", latestRuns[0]?.id);
  printMetric("COLLECTION_RUN_STARTED_AT", latestRuns[0]?.started_at);
  printMetric("DUPLICATE_CANONICAL_IDENTITIES", duplicateCanonicalIdentities);

  verificationFailed ||= !latestSnapshots[0]?.collected_at;
  verificationFailed ||= latestRuns[0]?.status !== "healthy";
  verificationFailed ||= duplicateCanonicalIdentities > 0;
} catch (error) {
  printMetric("SUPABASE_CONNECTIVITY", "error");
  console.error(error instanceof Error ? error.message : "Supabase verification failed");
  verificationFailed = true;
}

process.exitCode = verificationFailed ? 1 : 0;
NODE
)
metrics_status=$?
set -e

printf '\nCollector checks:\n'
printf '%s\n' "$metrics_output" | awk '
  /^CLASH_CONNECTIVITY=/ { sub(/^[^=]*=/, ""); print "Clash connectivity: " $0 }
  /^SUPABASE_CONNECTIVITY=/ { sub(/^[^=]*=/, ""); print "Supabase connectivity: " $0 }
  /^LATEST_RAW_SNAPSHOT_AT=/ { sub(/^[^=]*=/, ""); print "Latest raw snapshot: " $0 }
  /^CANONICAL_WAR_COUNT=/ { sub(/^[^=]*=/, ""); print "Canonical wars: " $0 }
  /^CANONICAL_MEMBER_COUNT=/ { sub(/^[^=]*=/, ""); print "Canonical members: " $0 }
  /^COLLECTION_HEALTH=/ { sub(/^[^=]*=/, ""); print "Collection health: " $0 }
  /^COLLECTION_LAST_FRESH_AT=/ { sub(/^[^=]*=/, ""); print "Collection last fresh: " $0 }
  /^COLLECTION_RUN_ID=/ { sub(/^[^=]*=/, ""); print "Collection run: " $0 }
  /^COLLECTION_RUN_STARTED_AT=/ { sub(/^[^=]*=/, ""); print "Collection run started: " $0 }
  /^DUPLICATE_CANONICAL_IDENTITIES=/ { sub(/^[^=]*=/, ""); print "Duplicate canonical identities: " $0 }
'

duplicate_count=$(printf '%s\n' "$metrics_output" | awk -F= '$1 == "DUPLICATE_CANONICAL_IDENTITIES" { print $2; exit }')
if [ "${duplicate_count:-unknown}" != '0' ]; then
  verification_failed=1
fi
if [ "$metrics_status" -ne 0 ]; then
  verification_failed=1
fi

if [ "$verification_failed" -ne 0 ]; then
  printf '\nCollector verification failed.\n' >&2
  exit 1
fi

printf '\nCollector verification passed.\n'
