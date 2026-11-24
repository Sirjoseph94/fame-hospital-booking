#!/usr/bin/env bash
# Rebuild package-lock.json so it contains native binaries for every platform
# (see scripts/check-lockfile.mjs for why). Resolves in a scratch directory
# with no node_modules, using the npm version EAS uses, until stable; then
# reinstalls node_modules from the new lockfile with `npm ci`.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NPM="npx --yes npm@10.9.2"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

cp "$ROOT/package.json" "$TMP/"
[[ -f "$ROOT/.npmrc" ]] && cp "$ROOT/.npmrc" "$TMP/"
cd "$TMP"
echo "==> Resolving lockfile (npm 10.9.2, no node_modules)"
for pass in 1 2 3 4; do
  [[ -f package-lock.json ]] && cp package-lock.json previous.json
  $NPM install --package-lock-only --ignore-scripts --no-audit --no-fund --loglevel=error
  if [[ -f previous.json ]] && cmp -s previous.json package-lock.json; then
    echo "    stable after pass $pass"
    break
  fi
  [[ $pass -eq 4 ]] && { echo "error: lockfile did not stabilise" >&2; exit 1; }
done

cp package-lock.json "$ROOT/package-lock.json"
cd "$ROOT"
node scripts/check-lockfile.mjs
echo "==> Reinstalling node_modules from the new lockfile (npm ci)"
$NPM ci --no-audit --no-fund --loglevel=error
echo "==> Done. Review 'git diff --stat package-lock.json' and commit it."
