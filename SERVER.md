# Forecourt staff access

GitHub Pages serves the dashboard. The station owner's HTTPS server runs the API and stores accounts, meter photos and records. While STATION_API is empty, the existing local ledger stays available and the Staff sign-in button explains that configuration is pending.

## Server setup

Use Node.js 24 LTS, one service instance and a persistent private directory outside the public web root. Copy server.mjs to the service directory. Configure these in the host's secret or service environment.

| Setting | Value |
|---|---|
| DATA_DIR | Absolute path to the persistent private directory. Back up this directory with a SQLite-aware backup, or stop the service before copying it. |
| ADMIN_LOGIN | Initial administrator username, default admin. |
| ADMIN_PASSWORD | A unique password of 12–128 characters, supplied privately for the first startup. Remove after initialization. |
| PORT | Internal HTTP port, default 3000. |
| BIND_HOST | Default 127.0.0.1 for a local reverse proxy. For a container ingress, set the appropriate bind address. |
| ALLOWED_ORIGIN | https://iemfaraz.github.io |

Start the service with `node server.mjs` under the host's process supervisor. Route a dedicated HTTPS origin to it, allowing request bodies up to 8 MB. Verify GET /health, then set window.STATION_API in station-config.js to that HTTPS origin and commit the change. Keep the database, secret settings and actual meter photos outside the public GitHub repository.

## First use

1. Sign in as the administrator. Under Setup, import the old browser ledger on each device that holds records. Export the old ledger before changing hosts if needed.
2. Check each nozzle's purchase cost. New shift margins use the cost on its nozzle when the shift starts.
3. Open Setup → Manage staff. Admins can create admins, managers and salespeople. Managers can create salespeople. Deliver each account's credentials privately.
4. A salesperson signs in, selects Start shift, enters the opening meter and sale rate, and attaches the opening photo. At handover they choose Close shift and enter the closing meter, returns and a second photo. An open shift can be closed on another day. Managers can inspect both photos or close a shift during a handover.
5. The browser keeps the session token in memory. Refreshing the page requires sign-in again. Previously saved shifts can be reopened from another signed-in device. Backups from the ledger screen contain rows only. The server backup contains the private photos and staff accounts.
