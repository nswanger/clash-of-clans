#!/bin/sh
set -eu

project_root=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
verify_script="$project_root/scripts/verify-collector.sh"
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
    printf '%s\n' 'collector token sb_secret_not-safe Bearer eyJ.bad.value'
    ;;
  exec)
    cat >/dev/null
    cat <<EOF_OUTPUT
CLASH_CONNECTIVITY=ok
SUPABASE_CONNECTIVITY=ok
LATEST_RAW_SNAPSHOT_AT=2026-07-14T12:00:00.000Z
CANONICAL_WAR_COUNT=7
CANONICAL_MEMBER_COUNT=30
COLLECTION_HEALTH=healthy
COLLECTION_LAST_FRESH_AT=2026-07-14T12:00:00.000Z
DUPLICATE_CANONICAL_IDENTITIES=${MOCK_DUPLICATES:-0}
EOF_OUTPUT
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

run_verification() {
  set +e
  verification_output=$(PATH="$temporary_directory:$PATH" \
    MOCK_RUNNING="${MOCK_RUNNING:-true}" \
    MOCK_HEALTH="${MOCK_HEALTH:-healthy}" \
    MOCK_DUPLICATES="${MOCK_DUPLICATES:-0}" \
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
assert_contains "$verification_output" 'Duplicate canonical identities: 0' 'duplicate count is reported'
assert_not_contains "$verification_output" 'sb_secret_not-safe' 'Supabase secret-looking values are redacted'
assert_not_contains "$verification_output" 'eyJ.bad.value' 'bearer tokens are redacted'

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
