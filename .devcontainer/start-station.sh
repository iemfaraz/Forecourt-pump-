#!/usr/bin/env bash
set -euo pipefail
umask 077
# /workspaces persists across rebuilds. Keep the database out of the checkout.
export DATA_DIR=/workspaces/.forecourt-private
mkdir -p "$DATA_DIR"
export BIND_HOST=0.0.0.0 PORT=3000
export STATION_GITHUB_OWNER=1
if curl -fsS http://127.0.0.1:3000/health | grep -q '"station":"forecourt"'; then exit 0; fi
# The backend needs no Codespaces credentials in its process environment.
nohup env -i PATH="$PATH" HOME="$HOME" DATA_DIR="$DATA_DIR" BIND_HOST="$BIND_HOST" PORT="$PORT" STATION_GITHUB_OWNER=1 node server.mjs </dev/null >>"$DATA_DIR/service.log" 2>&1 &
for n in {1..20}; do
  if curl -fsS http://127.0.0.1:3000/health 2>/dev/null | grep -q '"station":"forecourt"'; then exit 0; fi
  sleep 1
done
echo 'Station API failed to start. Inspect the private service.log.' >&2
exit 1
