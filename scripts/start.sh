#!/usr/bin/env bash
# Start Cryptificate with one command.
#
#   npm start                 (or: scripts/start.sh)
#   PORT=4200 npm start       (another port)
#
# On the first run this installs whatever is missing (the pinned Lean toolchain,
# the Mathlib cache, the Rust engine and the workbench) through scripts/setup.sh.
# Then it starts the local service and opens the workbench in your browser.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORT:-4173}"
URL="http://127.0.0.1:${PORT}/"

missing=()
[ -x "$ROOT/target/release/cryptificate-engine" ] || missing+=("Rust engine")
[ -d "$ROOT/lean/.lake/build/lib" ] || missing+=("Lean certificate library")
[ -f "$ROOT/apps/server/dist/src/cli.js" ] || missing+=("local service")
[ -f "$ROOT/apps/web/dist/index.html" ] || missing+=("workbench")

if [ "${#missing[@]}" -gt 0 ]; then
  printf 'Setting up: %s\n' "$(IFS=', '; echo "${missing[*]}")"
  printf 'The first run downloads the pinned toolchains and takes a few minutes.\n\n'
  "$ROOT/scripts/setup.sh"
fi

open_browser() {
  for _ in $(seq 1 90); do
    if curl -fsS "${URL}api/capabilities" >/dev/null 2>&1; then
      printf '\nCryptificate is ready at %s\n' "$URL"
      if command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL" >/dev/null 2>&1 || true
      elif command -v open >/dev/null 2>&1; then open "$URL" >/dev/null 2>&1 || true
      fi
      return
    fi
    sleep 1
  done
}
open_browser &

exec node "$ROOT/apps/server/dist/src/cli.js" serve --port "$PORT"
