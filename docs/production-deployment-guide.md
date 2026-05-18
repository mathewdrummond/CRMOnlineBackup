# JoinerFlow Production Deployment Guide

This guide is for taking JoinerFlow live at Millbrook without losing configured data.

## Production Rule

Do not run reset, seed, or test-auth commands against the live database.

Preserve:

- `server/data`
- `server/filesystem`
- `server/logs`
- `server/.env` or `server/.env.local`
- backup folders

## Standard Go-Live Flow

1. Create a backup.
2. Build the release.
3. Run production preflight.
4. Start the backend service.
5. Start Caddy/nginx/reverse proxy.
6. Open `/health`.
7. Sign in with a bootstrap admin.
8. Check quotes, pricing, files, timeclock, documents, install planner, and backup status.

## Commands

```bash
npm ci
npm run build:release
npm run preflight:prod
npm run start:prod
```

`npm run preflight:prod` is non-destructive. It checks build outputs, required production environment values, writable storage paths, and the server production config.

## Required Server Environment

Set these in `server/.env.local` or the process environment:

```env
NODE_ENV=production
HOST=127.0.0.1
PORT=4000
PUBLIC_API_ORIGIN=https://crm.example.com
CORS_ORIGIN=https://crm.example.com
ALLOWED_HOSTS=crm.example.com
GOOGLE_CLIENT_ID=your-web-client.apps.googleusercontent.com
AUTH_BOOTSTRAP_ADMIN_EMAILS=owner@example.com
AUTH_SESSION_SECRET=at-least-32-characters
AUTH_SECURE_COOKIE=true
TRUST_PROXY=true
TIMECLOCK_KIOSK_KEY=strong-random-key
SQLITE_PATH=/opt/joinerflow/server/data/joinerflow.sqlite
FILESYSTEM_ROOT=/opt/joinerflow/server/filesystem
BACKUP_ROOT=/var/backups/joinerflow
LOG_DIRECTORY=/opt/joinerflow/server/logs
```

Use explicit production paths. Do not rely on repository default paths for live operation.

## Health Checks

- Backend: `https://crm.example.com/health`
- CRM login: `https://crm.example.com/login`
- Time clock, if published separately: `https://clock.example.com`
- Local backend when reverse-proxied: `http://127.0.0.1:4000/health`

## Synology NAS Install

Full guide: [Synology Installation Guide](synology-installation-guide.md)

Use the Synology scripts under `deployment/synology/` for the Millbrook NAS deployment.
The current LAN access and certificate setup is documented in
[Millbrook LAN Access And Certificates](millbrook-lan-access-and-certificates.md).

## Linux Install

Full guide: [Linux Install Guide](linux-install-guide.md)

Recommended layout:

```text
/opt/joinerflow
/var/backups/joinerflow
```

Use the included systemd examples:

- `deploy/systemd/joinerflow-api.service`
- `deploy/systemd/joinerflow-backup.service`

After copying and editing paths:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now joinerflow-api
sudo systemctl status joinerflow-api
```

## Reverse Proxy

Use HTTPS for CRM login. Google Identity Services expects secure origins.

Production backend should normally bind to `127.0.0.1:4000` and be exposed only through Caddy/nginx/Tailscale/reverse proxy.

An nginx example is available at `deploy/nginx/joinerflow.conf.example`.

## Operating Documents

- [Backup & Recovery Guide](backup-recovery-guide.md)
- [Upgrade Guide](upgrade-guide.md)
- [Security Notes](security-notes.md)
- [Troubleshooting Guide](troubleshooting-guide.md)
- [Go-Live Checklist](go-live-checklist.md)
- [Production Readiness Audit](production-readiness-audit.md)
