# Forecourt staff accounts

GitHub Pages hosts the public sign-in screen. Managers and admins create station IDs in Setup → Manage staff. Salespeople enter only their station username and password. No GitHub account or token is needed by a salesperson. Only the repository owner may use the separate owner-token sign-in.

## Development and testing

Use the dev container to test the Node.js 24 backend. The startup script creates its SQLite database outside the public repository under /workspaces/.forecourt-private. For local tests, serve the frontend locally and set its local station-config.js to the test API origin. Set ALLOWED_ORIGIN on the test API to allow the local frontend. Keep test configuration out of the Pages branch.

GitHub Codespaces is a development and testing service. GitHub's additional product terms exclude hosting a production-facing application in Codespaces. Do not connect the public production dashboard to a Codespace.

## Production

The Pages dashboard requires an HTTPS API running server.mjs with private persistent storage on a production host. Until configured, it shows the sign-in screen and an activation notice. No signed-out visitor can open the ledger through the dashboard. The public code repository contains no live accounts, credentials, meter photos or database.

The service accepts DATA_DIR, PORT, BIND_HOST and ALLOWED_ORIGIN. Use https://iemfaraz.github.io for the frontend origin. Supply ADMIN_LOGIN and ADMIN_PASSWORD privately for the initial administrator or enable the repository owner's verified GitHub-token sign-in with STATION_GITHUB_OWNER=1. The initialized database contains password hashes and private photo records. Back it up using SQLite online backup or stop the service before copying it. After confirming API health and authentication, set window.STATION_API in station-config.js to the production HTTPS origin.

The existing Deploy station backend workflow is optional for a separately authorized server. It is not needed for local development.
