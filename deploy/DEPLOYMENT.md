# Deployment Guide

## Current Deployment Model

The current application is a local-first system:

- the API runs as a local Node.js process
- business data stays in local SQLite on the host machine
- attachments stay in the host filesystem
- the CRM and time clock are built as static frontend bundles

Production deployment is therefore:

1. build the CRM, time clock, and API
2. run the API on the host
3. serve the static frontend bundles through a web server or reverse proxy
4. keep the SQLite database and attachment filesystem on the same machine as the API

## Repository-Supported Outputs

Build everything:

```bash
npm install
npm run build:release
```

This produces:

- `client/dist/`
- `clock-client/dist/`
- `server/dist/`

The built API entrypoint is:

```text
server/dist/index.js
```

## Supported Deployment Shapes

### 1. Single-Machine LAN Deployment

Recommended when the app is used only inside one office or workshop.

- API can stay local to the host machine
- static frontend bundles can be served by a local reverse proxy
- users connect over the LAN

### 2. Reverse-Proxy HTTPS Deployment

Recommended for any multi-device or internet-facing use.

- reverse proxy terminates HTTPS
- reverse proxy serves the CRM and time clock static files
- reverse proxy forwards `/api/*` and `/filesystem/*` to the local API
- API remains bound to `127.0.0.1`

### 3. Synology NAS Self-Hosting

The live Millbrook deployment runs on the Synology NAS using the scripts and Docker
configuration under `deployment/synology/`.

Use:

- `docs/synology-installation-guide.md`
- `docs/synology-troubleshooting.md`
- `docs/millbrook-lan-access-and-certificates.md`
- `deployment/synology/install-joinerflow.sh`
- `deployment/synology/scripts/check-health.sh`

That path is the supported production install for the NAS.

## Environment Files

### Server

Start from `server/.env.example`.

Typical production baseline:

```env
NODE_ENV=production
HOST=127.0.0.1
PORT=4000
TRUST_PROXY=true
AUTH_SECURE_COOKIE=true
AUTH_SESSION_SECRET=replace-with-a-long-random-secret
AUTH_SESSION_TTL_HOURS=12
# Use the current GOOGLE_CLIENT_ID as the production credential too.
# Configure the exact CRM production origin as an Authorized JavaScript origin in Google Cloud.
# Example: https://crm.example.com (no path).
# This app does not use GOOGLE_CLIENT_SECRET or OAuth redirect URIs for CRM sign-in.
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
AUTH_BOOTSTRAP_ADMIN_EMAILS=owner@example.com
PUBLIC_API_ORIGIN=https://crm.example.com
ALLOWED_HOSTS=crm.example.com,clock.example.com
CORS_ORIGIN=https://crm.example.com,https://clock.example.com
TIMECLOCK_KIOSK_KEY=replace-with-a-long-random-secret
# Set these explicitly for production so the service never reuses stale local dev data paths by accident.
SQLITE_PATH=/srv/joinerflow/data/joinerflow.sqlite
FILESYSTEM_ROOT=/srv/joinerflow/filesystem
```

### CRM Frontend

Start from `client/.env.example`.

For same-origin reverse-proxy hosting, leave:

```env
VITE_API_BASE_URL=
```

Set `VITE_TIMECLOCK_URL` only if the time clock is intentionally hosted at a separate URL.

### Time Clock Frontend

Start from `clock-client/.env.example`.

If kiosk access is enabled in production:

```env
VITE_TIMECLOCK_KIOSK_KEY=<same value as TIMECLOCK_KIOSK_KEY>
```

## Production Startup

Validate production config first:

```bash
npm run check:prod
```

Start the built API:

```bash
npm run start:prod
```

Important notes:

- `start:prod` runs the built API in the foreground
- for long-running production use, wrap it in your own process manager or service supervisor
- the repo does not currently ship Linux `systemd`, PM2, or Nginx config templates in `deploy/`

## Reverse Proxy Responsibilities

For Linux or macOS hosting, you need to provide your own reverse proxy configuration.

At minimum, your reverse proxy should:

- serve `client/dist/` as the CRM frontend
- optionally serve `clock-client/dist/` as the time clock frontend
- proxy `/api/*` to `http://127.0.0.1:4000/api/*`
- proxy `/filesystem/*` to `http://127.0.0.1:4000/filesystem/*`
- pass standard forwarded headers when `TRUST_PROXY=true`
- terminate HTTPS

## Ports

### Local Development

- `5173/tcp` CRM dev server
- `5174/tcp` time clock dev server
- `4000/tcp` API

These are local development ports and should not be exposed publicly.

### Production

Recommended exposure:

- public or LAN-facing: `80/tcp`, `443/tcp`
- internal only: `4000/tcp`

Do not expose the API directly to the internet unless you have a very specific reason and understand the trade-offs.

## Verification After Deployment

Run through this minimum checklist:

1. `npm run build:release`
2. `npm run check:prod`
3. start the API with `npm run start:prod`
4. confirm `/health` returns `200`
5. confirm the CRM frontend loads through the intended URL
6. confirm Google sign-in works from the production origin configured in Google Cloud
7. confirm admin-only pages remain restricted
8. confirm file uploads and downloads work
9. confirm backups are configured before the system is relied on

## Related Docs

- `ARCHITECTURE.md`
- `QUICKSTART.md`
- `SYSTEM_VERIFICATION.md`
- `SECURITY.md`
- `deploy/BACKUP_RESTORE.md`
- `deploy/GO_LIVE_CHECKLIST.md`
- `deploy/FIREWALL_PORTS.md`
- `docs/synology-installation-guide.md`
- `docs/millbrook-lan-access-and-certificates.md`
