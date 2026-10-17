#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cleanup() {
  trap - EXIT INT TERM
  kill "$backend_pid" "$frontend_pid" 2>/dev/null || true
  wait "$backend_pid" "$frontend_pid" 2>/dev/null || true
}

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

(cd "$ROOT_DIR/backend" && npm run dev) &
backend_pid=$!
(cd "$ROOT_DIR/frontend" && npm run dev) &
frontend_pid=$!

set +e
wait -n "$backend_pid" "$frontend_pid"
status=$?
exit "$status"
