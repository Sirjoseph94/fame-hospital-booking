#!/usr/bin/env bash
# Database migrations for the Supabase project.
#
#   scripts/db.sh status                 local migration files vs. what the database has applied
#   scripts/db.sh plan                   dry run: list migrations that would be applied
#   scripts/db.sh push [--yes] [--skip-tests]
#                                        apply pending migrations (runs the local migration
#                                        tests first, shows the plan, asks for confirmation)
#   scripts/db.sh baseline <version> [--yes]
#                                        mark every migration up to <version> as already
#                                        applied (databases set up via the SQL Editor)
#   scripts/db.sh new <name>             create supabase/migrations/<timestamp>_<name>.sql
#   scripts/db.sh test                   run the migration chain + security tests locally (Docker)
#
# Target database: SUPABASE_DB_URL, from the environment or from a gitignored
# .env.migrate file in the repo root. Use the Session pooler connection string
# (Supabase Dashboard → Connect → Session pooler; port 5432):
#   postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
#
# Uses the Supabase CLI through npx, pinned below (not a project dependency).

set -euo pipefail

SUPABASE_CLI_VERSION="3.3.0"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MIGRATIONS_DIR="$ROOT/supabase/migrations"

die() { echo "error: $*" >&2; exit 1; }
info() { echo "==> $*"; }

supabase_cli() {
  npx --yes "supabase@${SUPABASE_CLI_VERSION}" --workdir "$ROOT" "$@"
}

load_db_url() {
  if [[ -z "${SUPABASE_DB_URL:-}" && -f "$ROOT/.env.migrate" ]]; then
    # Read only this one key; never source the file.
    SUPABASE_DB_URL="$(grep -E '^SUPABASE_DB_URL=' "$ROOT/.env.migrate" | head -1 | cut -d= -f2- \
      | sed -E "s/^[\"']//; s/[\"']$//")"
  fi
  [[ -n "${SUPABASE_DB_URL:-}" ]] || die "SUPABASE_DB_URL is not set (export it or put it in .env.migrate). See docs/RUNBOOK.md §2."
  [[ "$SUPABASE_DB_URL" =~ ^postgres(ql)?:// ]] || die "SUPABASE_DB_URL must start with postgresql://"
}

# user@host:port/db with the password removed, for display and confirmation.
db_label() {
  echo "$SUPABASE_DB_URL" | sed -E 's#^postgres(ql)?://([^:@/]+)(:[^@]*)?@#\2@#; s#\?.*$##'
}

db_host() {
  echo "$SUPABASE_DB_URL" | sed -E 's#^postgres(ql)?://[^@]*@##; s#[:/?].*$##'
}

confirm() {
  # $1 = prompt, $2 = word the user must type
  local reply
  if [[ ! -t 0 ]]; then
    die "refusing to continue without a terminal; re-run with --yes to confirm non-interactively"
  fi
  read -r -p "$1 Type '$2' to continue: " reply
  [[ "$reply" == "$2" ]] || die "aborted"
}

local_versions() {
  find "$MIGRATIONS_DIR" -maxdepth 1 -name '*.sql' -exec basename {} \; | sort | sed -E 's/_.*$//'
}

cmd_status() {
  load_db_url
  info "Target: $(db_label)"
  supabase_cli migration list --remote="$SUPABASE_DB_URL"
}

cmd_plan() {
  load_db_url
  info "Target: $(db_label)"
  supabase_cli db push --remote="$SUPABASE_DB_URL" --skip-vault --dry-run
}

cmd_push() {
  local assume_yes=false skip_tests=false
  for arg in "$@"; do
    case "$arg" in
      --yes) assume_yes=true ;;
      --skip-tests) skip_tests=true ;;
      *) die "unknown option for push: $arg" ;;
    esac
  done
  load_db_url

  if [[ "$skip_tests" == false ]]; then
    info "Running migration tests on a throwaway database first (scripts/db.sh test)"
    local log
    log="$(mktemp)"
    if ! bash "$ROOT/supabase/tests/run.sh" >"$log" 2>&1; then
      tail -30 "$log"
      rm -f "$log"
      die "migration tests failed; fix them before pushing (or --skip-tests if Docker is unavailable)"
    fi
    grep -E '^==>|identical' "$log" || true
    rm -f "$log"
  fi

  info "Target: $(db_label)"
  info "Pending migrations (dry run):"
  local plan_output
  plan_output="$(supabase_cli db push --remote="$SUPABASE_DB_URL" --skip-vault --dry-run 2>&1)"
  echo "$plan_output"
  if grep -qiE 'up to date|"upToDate":true' <<<"$plan_output"; then
    info "Nothing to apply."
    return 0
  fi

  if [[ "$assume_yes" == false ]]; then
    confirm "Apply these migrations to $(db_host)?" "$(db_host)"
  fi

  info "Applying"
  supabase_cli db push --remote="$SUPABASE_DB_URL" --skip-vault --yes
  info "Done. Current state:"
  supabase_cli migration list --remote="$SUPABASE_DB_URL"
}

cmd_baseline() {
  local target="${1:-}" assume_yes=false
  [[ -n "$target" ]] || die "usage: scripts/db.sh baseline <version> [--yes]  (e.g. 20260920000000)"
  shift
  [[ "${1:-}" == "--yes" ]] && assume_yes=true
  load_db_url

  local versions=() v
  while IFS= read -r v; do
    [[ "$v" < "$target" || "$v" == "$target" ]] && versions+=("$v")
  done < <(local_versions)
  local_versions | grep -qx "$target" || die "no migration file with version $target in supabase/migrations"

  info "Target: $(db_label)"
  echo "These migrations will be recorded as ALREADY APPLIED (their SQL is not run):"
  for v in "${versions[@]}"; do
    echo "  $(basename "$(ls "$MIGRATIONS_DIR/${v}"_*.sql)")"
  done
  echo "Only do this for migrations you have really applied (e.g. via the SQL Editor)."
  echo "Anything after $target will be applied by the next 'push'."

  if [[ "$assume_yes" == false ]]; then
    confirm "Record ${#versions[@]} migration(s) as applied on $(db_host)?" "baseline"
  fi
  supabase_cli migration repair --remote="$SUPABASE_DB_URL" --status applied --yes "${versions[@]}"
  supabase_cli migration list --remote="$SUPABASE_DB_URL"
}

cmd_new() {
  local name="${1:-}"
  [[ "$name" =~ ^[a-z0-9_]+$ ]] || die "usage: scripts/db.sh new <name>  (lowercase letters, digits, underscores)"
  local version file previous
  version="$(date -u +%Y%m%d%H%M%S)"
  file="$MIGRATIONS_DIR/${version}_${name}.sql"
  # Look up the latest existing migration *before* creating the new file.
  previous="$(basename "$(find "$MIGRATIONS_DIR" -maxdepth 1 -name '*.sql' | sort | tail -1)")"
  cat > "$file" <<EOF
-- =========================================================================
-- ${name//_/ }
-- Runs after ${previous}.
--
-- Keep it idempotent (the chain is re-run in CI):
--   * drop policy if exists "..." on <table>;  before every create policy
--   * create table/index ... if not exists; create or replace function
--   * drop trigger if exists ... before create trigger
-- Add tests for new policies / RPCs to supabase/tests/security_tests.sql.
-- =========================================================================

EOF
  echo "Created ${file#"$ROOT/"}"
}

cmd_test() {
  bash "$ROOT/supabase/tests/run.sh"
}

main() {
  local command="${1:-}"
  [[ $# -gt 0 ]] && shift
  case "$command" in
    status) cmd_status ;;
    plan) cmd_plan ;;
    push) cmd_push "$@" ;;
    baseline) cmd_baseline "$@" ;;
    new) cmd_new "$@" ;;
    test) cmd_test ;;
    ""|-h|--help|help) sed -n '2,23p' "$0" | sed -E 's/^# ?//' ;;
    *) die "unknown command: $command (try: scripts/db.sh help)" ;;
  esac
}

main "$@"
