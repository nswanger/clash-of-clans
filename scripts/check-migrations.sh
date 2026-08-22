#!/bin/sh
# Fails when a migration in supabase/migrations has no matching entry in the
# remote database's ledger (#65).
#
# Pages deploys on merge and the database does not, so a surface that reads new
# schema can ship days before -- or instead of -- the schema it reads. That is
# what happened on 2026-08-20. The runbook already carries the rule; this is the
# same rule with teeth.
#
# It reads supabase_migrations.schema_migrations directly rather than calling
# `supabase migration list --linked`, because that command authenticates with an
# account-wide personal access token. The `migration_auditor` role this connects
# as can read two columns of one ledger table and nothing else.
#
# Usage:
#   SUPABASE_MIGRATION_AUDIT_URL='postgresql://...' sh scripts/check-migrations.sh
set -eu

migrations_directory=${MIGRATIONS_DIRECTORY:-supabase/migrations}

if [ -z "${SUPABASE_MIGRATION_AUDIT_URL:-}" ]; then
  printf 'SUPABASE_MIGRATION_AUDIT_URL is not set.\n' >&2
  printf 'It is the read-only migration_auditor connection string; see docs/runbooks/supabase.md.\n' >&2
  exit 2
fi

if ! command -v psql >/dev/null 2>&1; then
  printf 'psql is required to read the remote migration ledger.\n' >&2
  exit 2
fi

if [ ! -d "$migrations_directory" ]; then
  printf 'No migrations directory at %s.\n' "$migrations_directory" >&2
  exit 2
fi

# The version is the leading digits of the filename, which is what the CLI
# stores in the ledger: 202608200001_cwl_bonus_administration.sql -> 202608200001.
local_versions=$(
  find "$migrations_directory" -maxdepth 1 -name '*.sql' -type f \
    | sed 's#.*/##; s#^\([0-9][0-9]*\)_.*#\1#' \
    | grep '^[0-9][0-9]*$' \
    | sort -u
)

if [ -z "$local_versions" ]; then
  printf 'No migration files found in %s; nothing to check.\n' "$migrations_directory"
  exit 0
fi

# A failure to connect must not read as "everything is applied", so the query is
# run before anything is compared and a non-zero exit stops the script here.
if ! remote_versions=$(
  psql "$SUPABASE_MIGRATION_AUDIT_URL" \
    --no-align --tuples-only --quiet \
    --command 'SELECT version FROM supabase_migrations.schema_migrations ORDER BY version' \
    2>&1
); then
  printf 'Could not read the remote migration ledger:\n%s\n' "$remote_versions" >&2
  exit 2
fi

remote_versions=$(printf '%s\n' "$remote_versions" | grep '^[0-9][0-9]*$' | sort -u || true)

# Deliberately a portable loop rather than `comm` with process substitution:
# this runs under /bin/sh, which is dash on the CI runner and would fail to
# parse `<(...)` at all.
unapplied=$(
  printf '%s\n' "$local_versions" | while IFS= read -r version; do
    [ -n "$version" ] || continue
    printf '%s\n' "$remote_versions" | grep -qx "$version" || printf '%s\n' "$version"
  done
)

if [ -n "$unapplied" ]; then
  printf '%s\n' "$unapplied" | while IFS= read -r version; do
    file=$(find "$migrations_directory" -maxdepth 1 -name "${version}_*.sql" -type f | head -n 1)
    printf '::error file=%s::Migration %s is not applied to the remote database.\n' "${file:-$migrations_directory}" "$version" >&2
    printf 'Unapplied migration: %s\n' "${file:-$version}" >&2
  done
  printf '\nThe schema deploys before the artifact that reads it. Apply these first:\n' >&2
  printf '  supabase db push --dry-run\n  supabase db push\n' >&2
  exit 1
fi

# Remote-only entries are informational. They mean production is ahead of this
# branch, which is normal on a branch cut before the last push and is never the
# failure this check exists for.
ahead=$(
  printf '%s\n' "$remote_versions" | while IFS= read -r version; do
    [ -n "$version" ] || continue
    printf '%s\n' "$local_versions" | grep -qx "$version" || printf '%s\n' "$version"
  done
)
if [ -n "$ahead" ]; then
  printf 'Remote is ahead of this branch (informational): %s\n' "$(printf '%s\n' "$ahead" | tr '\n' ' ')"
fi

printf 'All %s local migrations are applied to the remote database.\n' "$(printf '%s\n' "$local_versions" | wc -l | tr -d ' ')"
