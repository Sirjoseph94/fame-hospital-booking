#!/usr/bin/env bash
# Verifies the migration chain against a throwaway Postgres 17:
#   1. applies every file in supabase/migrations in filename order
#   2. applies them all again and checks the schema is unchanged (idempotent)
#   3. runs behavioural security tests (supabase/tests/security_tests.sql)
#
# Usage:
#   bash supabase/tests/run.sh                 # local: starts a postgres:17 Docker container
#   DATABASE_URL=postgres://... bash supabase/tests/run.sh   # CI / existing EMPTY database
#
# Never point DATABASE_URL at a real Supabase project: the script creates roles
# and stub auth/storage schemas.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
migrations="$here/../migrations"
container=""

cleanup() {
  if [[ -n "$container" ]]; then
    docker rm -f "$container" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

if [[ -z "${DATABASE_URL:-}" ]]; then
  container="hb-migrations-test-$$"
  docker run -d --name "$container" -e POSTGRES_PASSWORD=postgres postgres:17 >/dev/null
  for _ in $(seq 1 60); do
    docker exec "$container" pg_isready -U postgres >/dev/null 2>&1 && break
    sleep 1
  done
  sleep 1
  run_sql() { docker exec -i "$container" psql -q -X -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"; }
else
  run_sql() { psql "$DATABASE_URL" -q -X -v ON_ERROR_STOP=1 "$@"; }
fi

apply_chain() {
  for f in $(ls "$migrations"/*.sql | sort); do
    if ! out=$(run_sql < "$f" 2>&1); then
      echo "FAILED: $(basename "$f")"
      echo "$out"
      exit 1
    fi
    echo "  ok  $(basename "$f")"
  done
}

snapshot() { run_sql < "$here/snapshot.sql"; }

echo "==> Supabase stub"
run_sql < "$here/supabase_stub.sql"

echo "==> Migrations (fresh database)"
apply_chain
first="$(snapshot)"

echo "==> Migrations (re-run: must be idempotent)"
apply_chain
second="$(snapshot)"
if [[ "$first" != "$second" ]]; then
  echo "FAILED: schema differs after re-running migrations"
  diff <(echo "$first") <(echo "$second") || true
  exit 1
fi
echo "  ok  identical ($(echo "$first" | wc -l | tr -d ' ') objects)"

echo "==> Security tests"
if ! out=$(run_sql < "$here/security_tests.sql" 2>&1); then
  echo "$out" | sed -E 's/^psql:<stdin>:[0-9]+: //' | grep -E "PASS|FAIL|ERROR" || true
  exit 1
fi
echo "$out" | sed -E 's/^(psql:<stdin>:[0-9]+: )?NOTICE:  //' | grep -E "^PASS" | sed 's/^/  /'
echo "$out" | grep -q "ALL TESTS PASSED" && echo "==> ALL TESTS PASSED"
