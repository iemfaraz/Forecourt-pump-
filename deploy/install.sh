#!/usr/bin/env bash
# Run on the station host under the account that owns the service.
set -euo pipefail
umask 077
base="$HOME/.local/share/forecourt-station"
envdir="$HOME/.config/forecourt-station"
units="$HOME/.config/systemd/user"
mkdir -p "$base/data" "$envdir" "$units"
cd "$base"
node_path=$(command -v node)
"$node_path" -e "if (+process.versions.node.split('.')[0] < 24) process.exit(1); require('node:sqlite')"
"$node_path" --check server.next.mjs
if [[ ! -s "$envdir/service.env" ]]; then
  echo 'Configure the private service.env on the server first. See SERVER.md.' >&2
  exit 1
fi
chmod 600 "$envdir/service.env"
cat > "$units/forecourt-station.service" <<UNIT
[Unit]
Description=Forecourt station API
After=network.target
[Service]
Type=simple
WorkingDirectory=%h/.local/share/forecourt-station
EnvironmentFile=%h/.config/forecourt-station/service.env
Environment=DATA_DIR=%h/.local/share/forecourt-station/data
ExecStart="$node_path" "%h/.local/share/forecourt-station/server.mjs"
Restart=on-failure
RestartSec=3
UMask=0077
NoNewPrivileges=true
[Install]
WantedBy=default.target
UNIT
if [[ -f server.mjs ]]; then cp server.mjs server.previous.mjs; fi
mv server.next.mjs server.mjs
systemctl --user daemon-reload
systemctl --user enable forecourt-station.service
systemctl --user restart forecourt-station.service
