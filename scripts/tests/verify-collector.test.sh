#!/bin/sh
set -eu

project_root=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
verify_script="$project_root/scripts/verify-collector.sh"
collector_dockerfile="$project_root/docker/collector.Dockerfile"
temporary_directory=$(mktemp -d)
trap 'rm -rf "$temporary_directory"' EXIT HUP INT TERM

cat > "$temporary_directory/docker" <<'EOF'
#!/bin/sh
set -eu

case "$1" in
  inspect)
    case "$*" in
      *State.Running*) printf '%s\n' "${MOCK_RUNNING:-true}" ;;
      *State.Health.Status*) printf '%s\n' "${MOCK_HEALTH:-healthy}" ;;
      *) exit 2 ;;
    esac
    ;;
  logs)
    printf '%s\n' \
      'collector token sb_secret_not-safe Bearer eyJ.bad.value' \
      'CLASH_API_TOKEN=clash-raw-secret SUPABASE_SERVICE_ROLE_KEY=eyJ.raw.jwt' \
      'CLAN_TAG=#2ABCDEF player_tag=#9XYZ123' \
      'Clash API error for /clans/%232ENCODED/currentwar/leaguegroup'
    ;;
  exec)
    cat > "${MOCK_DOCKER_STDIN_FILE:-/dev/null}"
    cat <<EOF_OUTPUT
CLASH_CONNECTIVITY=ok
SUPABASE_CONNECTIVITY=ok
LATEST_RAW_SNAPSHOT_AT=2026-07-14T12:00:00.000Z
CANONICAL_WAR_COUNT=7
CANONICAL_MEMBER_COUNT=30
COLLECTION_HEALTH=${MOCK_COLLECTION_HEALTH:-healthy}
COLLECTION_LAST_FRESH_AT=2026-07-14T12:00:00.000Z
COLLECTION_RUN_ID=11111111-1111-4111-8111-111111111111
COLLECTION_RUN_STARTED_AT=2026-07-14T11:59:00.000Z
EXPECTED_IDLE_CWL_PARTIAL=${MOCK_EXPECTED_IDLE_CWL_PARTIAL:-no}
DUPLICATE_CANONICAL_IDENTITIES=${MOCK_DUPLICATES:-0}
EOF_OUTPUT
    exit "${MOCK_METRICS_EXIT:-0}"
    ;;
  *)
    exit 2
    ;;
esac
EOF
chmod +x "$temporary_directory/docker"

assert_equal() {
  expected=$1
  actual=$2
  message=$3
  if [ "$expected" != "$actual" ]; then
    printf 'FAIL: %s (expected %s, got %s)\n' "$message" "$expected" "$actual" >&2
    exit 1
  fi
}

assert_contains() {
  haystack=$1
  needle=$2
  message=$3
  if ! printf '%s\n' "$haystack" | grep -Fq "$needle"; then
    printf 'FAIL: %s (missing %s)\n' "$message" "$needle" >&2
    exit 1
  fi
}

assert_not_contains() {
  haystack=$1
  needle=$2
  message=$3
  if printf '%s\n' "$haystack" | grep -Fq "$needle"; then
    printf 'FAIL: %s (found %s)\n' "$message" "$needle" >&2
    exit 1
  fi
}

assert_contains "$(cat "$collector_dockerfile")" 'src/supabase-auth.ts' \
  'collector image packages the Supabase auth module required by the production verifier'

run_verification() {
  set +e
  verification_output=$(PATH="$temporary_directory:$PATH" \
    MOCK_RUNNING="${MOCK_RUNNING:-true}" \
    MOCK_HEALTH="${MOCK_HEALTH:-healthy}" \
    MOCK_DUPLICATES="${MOCK_DUPLICATES:-0}" \
    MOCK_COLLECTION_HEALTH="${MOCK_COLLECTION_HEALTH:-healthy}" \
    MOCK_EXPECTED_IDLE_CWL_PARTIAL="${MOCK_EXPECTED_IDLE_CWL_PARTIAL:-no}" \
    MOCK_METRICS_EXIT="${MOCK_METRICS_EXIT:-0}" \
    MOCK_DOCKER_STDIN_FILE="$temporary_directory/docker-stdin" \
    "$verify_script" 2>&1)
  verification_status=$?
  set -e
}

run_verification
assert_equal 0 "$verification_status" 'healthy collector verification succeeds'
assert_contains "$verification_output" 'Container health: healthy' 'container health is reported'
assert_contains "$verification_output" 'Clash connectivity: ok' 'Clash connectivity is reported'
assert_contains "$verification_output" 'Canonical wars: 7' 'canonical war count is reported'
assert_contains "$verification_output" 'Canonical members: 30' 'canonical member count is reported'
assert_contains "$verification_output" 'Collection run: 11111111-1111-4111-8111-111111111111' 'latest completed run is reported'
assert_contains "$verification_output" 'Collection run started: 2026-07-14T11:59:00.000Z' 'latest run start is reported'
assert_contains "$verification_output" 'Duplicate canonical identities: 0' 'duplicate count is reported'
assert_not_contains "$verification_output" 'sb_secret_not-safe' 'Supabase secret-looking values are redacted'
assert_not_contains "$verification_output" 'eyJ.bad.value' 'bearer tokens are redacted'
assert_not_contains "$verification_output" 'eyJ.raw.jwt' 'bare JWT-looking values are redacted'
assert_not_contains "$verification_output" 'clash-raw-secret' 'named Clash tokens are redacted'
assert_not_contains "$verification_output" '#2ABCDEF' 'clan tags are redacted'
assert_not_contains "$verification_output" '#9XYZ123' 'player tags are redacted'
assert_not_contains "$verification_output" '%232ENCODED' 'URL-encoded clan tags are redacted'
docker_exec_script=$(cat "$temporary_directory/docker-stdin")
assert_contains "$docker_exec_script" 'buildSupabaseRequestHeaders' 'verification reuses collector Supabase header compatibility'
assert_not_contains "$docker_exec_script" 'authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`' 'verification does not force modern secret keys into bearer auth'

(cd "$project_root" && pnpm --filter @cwl/collector exec tsc -p tsconfig.build.json --outDir "$temporary_directory/dist")
SUPABASE_AUTH_MODULE="$temporary_directory/dist/supabase-auth.js" node --input-type=module <<'NODE'
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const { buildSupabaseRequestHeaders } = await import(
  pathToFileURL(process.env.SUPABASE_AUTH_MODULE).href
);
const currentHeaders = buildSupabaseRequestHeaders("sb_secret_runtime-test");
assert.equal(currentHeaders.apikey, "sb_secret_runtime-test");
assert.equal(currentHeaders.authorization, undefined);

const legacyHeaders = buildSupabaseRequestHeaders("legacy.runtime.jwt");
assert.equal(legacyHeaders.apikey, "legacy.runtime.jwt");
assert.equal(legacyHeaders.authorization, "Bearer legacy.runtime.jwt");
NODE

cat > "$temporary_directory/fetch-mock.mjs" <<'NODE'
process.env.CLASH_API_TOKEN = "test-clash-token";
process.env.CLAN_TAG = "#TEST";
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_test";

const baseAttempts = [
  { endpoint: "clan", status: "healthy", http_status: 200, error_category: null },
  { endpoint: "members", status: "healthy", http_status: 200, error_category: null },
  {
    endpoint: "player", status: "healthy", http_status: 200, error_category: null,
    request_identity: "#ONE",
  },
  {
    endpoint: "player", status: "healthy", http_status: 200, error_category: null,
    request_identity: "#TWO",
  },
  { endpoint: "league_group", status: "error", http_status: 404, error_category: "not_found" },
];

function attemptsForScenario() {
  if (process.env.MOCK_SCENARIO === "missing_player") {
    return baseAttempts.filter((attempt, index) => attempt.endpoint !== "player" || index === 2);
  }
  if (process.env.MOCK_SCENARIO === "additional_failure") {
    return [...baseAttempts, {
      endpoint: "player", status: "error", http_status: 429, error_category: "rate_limited",
    }];
  }
  return baseAttempts;
}

globalThis.fetch = async (input) => {
  const url = new URL(String(input));
  if (url.hostname === "api.clashofclans.com") {
    return new Response(JSON.stringify({ memberList: [{ tag: "#ONE" }, { tag: "#TWO" }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  const table = url.pathname.split("/rest/v1/")[1];
  let body;
  if (table === "raw_snapshots") body = [{ collected_at: "2026-07-14T12:00:00.000Z" }];
  else if (table === "collection_runs") body = [{
    id: "11111111-1111-4111-8111-111111111111",
    status: "partial",
    started_at: "2026-07-14T11:59:00.000Z",
    last_fresh_at: "2026-07-14T12:00:00.000Z",
  }];
  else if (table === "collection_attempts") body = attemptsForScenario();
  else body = [];
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};
NODE

run_captured_metrics() {
  set +e
  captured_metrics_output=$(cd "$temporary_directory" && \
    MOCK_SCENARIO=$1 node --import ./fetch-mock.mjs --input-type=module < docker-stdin 2>&1)
  captured_metrics_status=$?
  set -e
}

run_captured_metrics expected_idle
assert_equal 0 "$captured_metrics_status" 'executed verifier accepts complete idle-CWL attempts'
assert_contains "$captured_metrics_output" 'EXPECTED_IDLE_CWL_PARTIAL=yes' 'executed verifier identifies expected idle-CWL partial'

run_captured_metrics missing_player
assert_equal 1 "$captured_metrics_status" 'executed verifier rejects missing player attempts'
assert_contains "$captured_metrics_output" 'EXPECTED_IDLE_CWL_PARTIAL=no' 'missing player attempts are not expected idle-CWL partial'

run_captured_metrics additional_failure
assert_equal 1 "$captured_metrics_status" 'executed verifier rejects additional endpoint failures'
assert_contains "$captured_metrics_output" 'EXPECTED_IDLE_CWL_PARTIAL=no' 'additional failures are not expected idle-CWL partial'

MOCK_COLLECTION_HEALTH=partial
MOCK_EXPECTED_IDLE_CWL_PARTIAL=yes
run_verification
assert_equal 0 "$verification_status" 'idle-CWL league-group absence is an acceptable partial run'
assert_contains "$verification_output" 'Expected idle CWL partial: yes' 'accepted partial reason remains visible'

MOCK_EXPECTED_IDLE_CWL_PARTIAL=no
MOCK_METRICS_EXIT=1
run_verification
assert_equal 1 "$verification_status" 'other partial runs fail verification'

MOCK_COLLECTION_HEALTH=healthy
MOCK_EXPECTED_IDLE_CWL_PARTIAL=no
MOCK_METRICS_EXIT=0

MOCK_DUPLICATES=2
run_verification
assert_equal 1 "$verification_status" 'duplicate canonical identities fail verification'
assert_contains "$verification_output" 'Duplicate canonical identities: 2' 'duplicate failure reports the count'

MOCK_DUPLICATES=0
MOCK_HEALTH=unhealthy
run_verification
assert_equal 1 "$verification_status" 'unhealthy container fails verification'
assert_contains "$verification_output" 'Container health: unhealthy' 'unhealthy state is reported'

printf 'verify-collector tests passed\n'
