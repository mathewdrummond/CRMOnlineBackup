# Linux Install Guide

This guide is for running JoinerFlow on a small workshop server or Linux PC. It assumes the current Millbrook data must be preserved.

## Requirements

- Ubuntu Server 22.04/24.04 or another current Linux distribution.
- Node.js 20 or newer.
- npm.
- A dedicated application folder, for example `/opt/joinerflow`.
- A backup folder outside the repo, for example `/var/backups/joinerflow`.
- Optional but recommended: Caddy or nginx for HTTPS and stable local URLs.
- Optional: Tailscale for private remote access.

## First Install

1. Copy or clone the repo to the server:

   ```bash
   sudo mkdir -p /opt/joinerflow
   sudo chown "$USER":"$USER" /opt/joinerflow
   git clone <repo-url> /opt/joinerflow
   cd /opt/joinerflow
   ```

2. Install dependencies:

   ```bash
   npm ci
   ```

3. Create production environment files:

   ```bash
   cp server/.env.example server/.env.local
   nano server/.env.local
   ```

   Required production values:

   - `NODE_ENV=production`
   - `HOST=0.0.0.0`
   - `PORT=4000`
   - `PUBLIC_API_ORIGIN=https://your-joinerflow-address`
   - `AUTH_SESSION_SECRET` with a long random value
   - Google OAuth client settings, if Google login is used
   - `SQLITE_PATH`, if the database is stored outside the default folder

4. Build and validate:

   ```bash
   npm run build
   npm run preflight:prod
   ```

5. Start production manually for the first test:

   ```bash
   npm run start:prod
   ```

6. Open the health check:

   ```text
   https://your-joinerflow-address/api/health
   ```

## systemd Service

Example service files are in `deploy/systemd/`.

Copy and adjust them:

```bash
sudo cp deploy/systemd/joinerflow-api.service /etc/systemd/system/joinerflow-api.service
sudo systemctl daemon-reload
sudo systemctl enable joinerflow-api
sudo systemctl start joinerflow-api
sudo systemctl status joinerflow-api
```

Review the service file before enabling it. Confirm:

- `WorkingDirectory` points to the real repo path.
- The service user has read/write access to `server/data`, `server/filesystem`, logs, and backups.
- Environment files point to the production `.env.local`.

## Reverse Proxy

Use HTTPS for production, even on a private network. Caddy is the simplest option. nginx also works.

JoinerFlow backend:

```text
http://127.0.0.1:4000
```

JoinerFlow frontend, if served separately:

```text
http://127.0.0.1:5173
```

Staff Time Clock / Handover Pack:

```text
http://127.0.0.1:5174
```

If using the production backend to serve the built app, point the proxy at the backend and keep only the backend exposed.

## Backups

Run a backup before every upgrade:

```bash
deploy/linux/backup-joinerflow.sh /opt/joinerflow /var/backups/joinerflow
```

Automated backup service examples:

```bash
sudo cp deploy/systemd/joinerflow-backup.service /etc/systemd/system/joinerflow-backup.service
sudo cp deploy/systemd/joinerflow-backup.timer /etc/systemd/system/joinerflow-backup.timer
sudo systemctl daemon-reload
sudo systemctl enable --now joinerflow-backup.timer
```

## Restore

Stop the app, restore, then restart:

```bash
sudo systemctl stop joinerflow-api
deploy/linux/restore-joinerflow.sh /opt/joinerflow /var/backups/joinerflow/<backup-folder>
sudo systemctl start joinerflow-api
```

The restore script validates the backup first, creates a safety backup, stages restored folders, and attempts rollback if the restore fails during the swap.

## Tailscale

Recommended production posture:

- Keep JoinerFlow off the public internet.
- Expose it through Tailscale or a private LAN.
- Use HTTPS even inside the private network.
- Restrict admin access to trusted devices.

## Printing

For workshop printing:

- Test quote printouts.
- Test production handover pack printing.
- Test A3 drawings from the Time Clock handover tab.
- Confirm the browser print dialog uses the correct printer and paper size.

## Go-Live Check

Before live use:

```bash
npm run build
npm run preflight:prod
curl -f https://your-joinerflow-address/api/health
```

Then verify:

- Login works.
- Existing quotes, pricing, categories, files, imports, and timeclock records are present.
- Uploads open only from the correct quote/job.
- Backups are being created outside the repo.
- Restore has been tested on a copy, not for the first time during an emergency.
