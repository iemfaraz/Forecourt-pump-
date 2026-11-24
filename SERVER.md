# GitHub-hosted station dashboard

The public repository contains the source. GitHub Pages displays the login page. The account database and meter photos live in a private folder on the owner's GitHub Codespace. The public API port enforces account permissions on requests. Staff sign in with the username and password created for them in Setup → Manage staff. There is no public registration.

## Owner activation

1. Create or start a Codespace on main for this repository. The dev container starts the station service on port 3000. In the Ports panel set port 3000 to Public. This exposes the login endpoint to staff.
2. Open the GitHub Pages dashboard, expand Repository owner, and enter the Codespace name and your GitHub token privately. Initial connection requires permission to read that Codespace and write repository contents. The app verifies Codespace ownership, repository, and health before committing the public endpoint to station-config.js. Allow GitHub Pages to publish that commit. For subsequent owner logins only GitHub identity verification is needed. The app holds tokens in memory.
3. In Setup → Manage staff create a salesperson or manager with a station username and password. Salespeople use only Nozzle shifts. They start and close a shift with separate readings and meter photos. Managers can review those photos. In Setup, verify nozzle purchase rates and import any previous browser ledger from the device that holds it.

The Codespace must be running during staff use. GitHub may stop it after inactivity and may delete stopped Codespaces after the retention period. Restart the same Codespace to reconnect. GitHub applies its compute/storage quotas and billing settings. This is a development host with interruptions.

## Private data backup

The SQLite database is under /workspaces/.forecourt-private, outside the repository. Keep private backups before deleting the Codespace. Use a SQLite online backup or stop the service before copying the database and any journal files. A dashboard ledger export omits accounts and meter photos. Never upload the database or actual meter photos to the public repository.
