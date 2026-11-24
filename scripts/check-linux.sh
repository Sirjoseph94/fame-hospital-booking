#!/usr/bin/env bash
# Reproduce the EAS Build / CI Linux environment locally before pushing:
# clean `npm ci` (npm 10.9.2) on linux/amd64, load metro.config.js (NativeWind
# → lightningcss native binary), then a full web export.
#
# Catches "works on my Mac" problems such as a package-lock.json missing the
# Linux builds of native packages, e.g.
#   Error: Cannot find module '../lightningcss.linux-x64-gnu.node'
#
# Usage: bash scripts/check-linux.sh   (needs Docker; slower on Apple Silicon
# because x86-64 is emulated)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NODE_IMAGE="${NODE_IMAGE:-node:22-bookworm}"   # glibc, like EAS and GitHub Actions

docker info >/dev/null 2>&1 || { echo "error: Docker is not running" >&2; exit 1; }

echo "==> ${NODE_IMAGE} (linux/amd64): npm ci + metro config + web export"
# The repo is mounted read-only and copied (without node_modules/dist) so the
# container's Linux node_modules never touch the host's.
docker run --rm --platform linux/amd64 \
  -v "$ROOT:/src:ro" \
  -e EXPO_NO_TELEMETRY=1 \
  -e EXPO_PUBLIC_SUPABASE_URL=https://example.supabase.co \
  -e EXPO_PUBLIC_SUPABASE_ANON_KEY=check-linux-placeholder \
  "$NODE_IMAGE" bash -euo pipefail -c '
    mkdir /app
    tar -C /src --exclude=./node_modules --exclude=./dist --exclude=./.git \
      --exclude=./.expo --exclude=./.env -cf - . | tar -C /app -xf -
    cd /app
    npx --yes npm@10.9.2 ci --no-audit --no-fund --loglevel=error
    node -e "require(\"./metro.config.js\"); console.log(\"  ok  metro.config.js loads (lightningcss native binary found)\")"
    npx expo export --platform web --output-dir /tmp/web-export >/tmp/export.log 2>&1 \
      || { tail -40 /tmp/export.log; exit 1; }
    grep -E "Bundled" /tmp/export.log | sed "s/^/  ok  /"
  '
echo "==> Linux check passed"
