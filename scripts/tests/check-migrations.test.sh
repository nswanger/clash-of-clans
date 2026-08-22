#!/bin/sh
set -eu

project_root=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
check_script="$project_root/scripts/check-migrations.sh"
temporary_directory=$(mktemp -d)
trap 'rm -rf "$temporary_directory"' EXIT HUP INT TERM

# The remote ledger stands in as a mock psql on PATH. MOCK_REMOTE_VERSIONS is
# the ledger contents; MOCK_PSQL_EXIT non-zero is an unreachable database, which
# must never read as "everything is applied".
cat > "$temporary_directory/psql" <<'EOF'
#!/bin/sh
set -eu
if [ "${MOCK_PSQL_EXIT:-0}" != '0' ]; then
  printf 'could not translate host name\n' >&2
  exit "${MOCK_PSQL_EXIT}"
fi
printf '%s' "${MOCK_REMOTE_VERSIONS:-}" | tr ' ' '\n' | grep -v '^$' || true
EOF
chmod +x "$temporary_directory/psql"

migrations_directory="$temporary_directory/migrations"
mkdir -p "$migrations_directory"
: > "$migrations_directory/202607110001_core_schema.sql"
: > "$migrations_directory/202608200001_cwl_bonus_administration.sql"

assert_equal() {
  if [ "$1" != "$2" ]; then
    printf 'FAIL: %s (expected %s, got %s)\n' "$3" "$1" "$2" >&2
    exit 1
  fi
}

assert_contains() {
  if ! printf '%s\n' "$1" | grep -Fq "$2"; then
    printf 'FAIL: %s (missing %s)\n' "$3" "$2" >&2
    exit 1
  fi
}

run_check() {
  set +e
  check_output=$(PATH="$temporary_directory:$PATH" \
    MIGRATIONS_DIRECTORY="$migrations_directory" \
    SUPABASE_MIGRATION_AUDIT_URL="${MOCK_AUDIT_URL-postgresql://migration_auditor@example/postgres}" \
    MOCK_REMOTE_VERSIONS="${MOCK_REMOTE_VERSIONS:-}" \
    MOCK_PSQL_EXIT="${MOCK_PSQL_EXIT:-0}" \
    sh "$check_script" 2>&1)
  check_status=$?
  set -e
}

MOCK_REMOTE_VERSIONS='202607110001 202608200001'
run_check
assert_equal 0 "$check_status" 'a fully applied migration set passes'
assert_contains "$check_output" 'All 2 local migrations are applied' 'the pass reports how many were checked'

# The exact 2026-08-20 defect: the file is in the repository, the column is not
# in the database.
MOCK_REMOTE_VERSIONS='202607110001'
run_check
assert_equal 1 "$check_status" 'an unapplied migration fails the check'
assert_contains "$check_output" '202608200001_cwl_bonus_administration.sql' 'the failure names the offending file'
assert_contains "$check_output" 'supabase db push' 'the failure says how to fix it'

# Production ahead of the branch is normal and is not what this check is for.
MOCK_REMOTE_VERSIONS='202607110001 202608200001 202609010001'
run_check
assert_equal 0 "$check_status" 'a remote ahead of the branch still passes'
assert_contains "$check_output" 'Remote is ahead of this branch' 'being behind is reported as informational'

# An unreachable database must be a distinct, loud failure. Exit 2 rather than 1
# keeps "cannot tell" from being read as "nothing is unapplied".
MOCK_REMOTE_VERSIONS='202607110001 202608200001'
MOCK_PSQL_EXIT=2
run_check
assert_equal 2 "$check_status" 'an unreachable database fails rather than passing'
assert_contains "$check_output" 'Could not read the remote migration ledger' 'the connection failure is named'
MOCK_PSQL_EXIT=0

MOCK_AUDIT_URL=''
run_check
assert_equal 2 "$check_status" 'a missing connection string fails rather than passing'
assert_contains "$check_output" 'SUPABASE_MIGRATION_AUDIT_URL is not set' 'the missing secret is named'

printf 'check-migrations tests passed\n'
