#!/usr/bin/env bash
# Run the Row Level Security + business-rule tests against the local database.
#
#   npm run db:test
#
# Uses a local `psql` when one is installed and can reach the database;
# otherwise runs psql inside the Supabase database container (no local
# PostgreSQL tools needed). Every test runs in a transaction that is rolled
# back, so your local data is not changed. Stops at the first failure.
set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/lib.sh

test_file="${1:-supabase/tests/rls_test.sql}"
db_url="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
container="${SUPABASE_DB_CONTAINER:-$(db_container)}"

[ -f "$test_file" ] || die "Test file not found: $test_file"

if command -v psql >/dev/null 2>&1 && psql "$db_url" -X -q -t -c 'select 1' >/dev/null 2>&1; then
  say "Running $test_file with your local psql..."
  psql "$db_url" -X -v ON_ERROR_STOP=1 -f "$test_file"
elif command -v docker >/dev/null 2>&1 && docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$container"; then
  say "Running $test_file inside the $container container..."
  docker exec -i "$container" psql -U postgres -X -v ON_ERROR_STOP=1 -f - < "$test_file"
else
  die "Cannot reach the local database. Start it with 'npm run db:start' (and 'npm run db:reset' to load the sample data)."
fi

ok "Database tests finished without failures."
