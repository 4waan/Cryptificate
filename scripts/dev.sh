#!/usr/bin/env bash
# Development loop: the local service on 127.0.0.1:4173 and the Vite dev server
# for the web UI on :5173 (which forwards /api to the service). Ctrl-C stops both.
#
#   scripts/dev.sh [--port 4173] [--no-web]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT=4173
WEB=1
while [ $# -gt 0 ]; do
  case "$1" in
    --port) PORT="$2"; shift 2 ;;
    --no-web) WEB=0; shift ;;
    -h|--help) sed -n '2,5p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "dev: unknown option $1" >&2; exit 2 ;;
  esac
done

cd "$ROOT"
if [ -f "$HOME/.elan/env" ]; then
  # shellcheck disable=SC1091
  . "$HOME/.elan/env"
fi
[ -d node_modules ] || npm install --no-audit --no-fund
npm run build -w packages/schema >/dev/null
npm run build -w apps/server >/dev/null

PIDS=()
cleanup() {
  for pid in "${PIDS[@]}"; do kill "$pid" 2>/dev/null || true; done
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

node apps/server/dist/src/cli.js serve --port "$PORT" &
PIDS+=($!)

if [ "$WEB" -eq 1 ] && [ -d apps/web ]; then
  CRYPTIFICATE_SERVICE="http://127.0.0.1:$PORT" npm run dev -w apps/web &
  PIDS+=($!)
fi

wait -n "${PIDS[@]}"
