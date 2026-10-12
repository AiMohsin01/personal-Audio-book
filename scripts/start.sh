#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
if [[ ! -x .venv/bin/uvicorn || ! -d node_modules ]]; then
  echo 'Run bash scripts/setup.sh first.' >&2
  exit 1
fi
if [[ "${1:-}" == '--dev' ]]; then
  mode=dev
  port=5173
elif [[ -z "${1:-}" ]]; then
  mode=preview
  port=4173
  if [[ ! -f dist/index.html ]]; then
    echo 'Run npm run build first.' >&2
    exit 1
  fi
else
  echo 'Usage: bash scripts/start.sh [--dev]' >&2
  exit 1
fi
.venv/bin/uvicorn companion.app:app --host 127.0.0.1 --port 8765 &
companion_pid=$!
vite_args=()
if [[ "$mode" == preview ]]; then vite_args+=(preview); fi
node node_modules/vite/bin/vite.js "${vite_args[@]}" --host 0.0.0.0 --port "$port" --strictPort &
web_pid=$!
cleanup() {
  kill "$companion_pid" "$web_pid" 2>/dev/null || true
  wait "$companion_pid" "$web_pid" 2>/dev/null || true
}
trap cleanup EXIT INT TERM
wait -n "$companion_pid" "$web_pid"
