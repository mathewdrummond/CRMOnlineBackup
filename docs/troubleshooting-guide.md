# JoinerFlow Troubleshooting Guide

## Current Infrastructure Stack

Updated from live production check on 2026-05-27.

- Active NAS/app host: Synology `Data` at `192.168.1.32`; `192.168.1.31` was not the active reachable host during this check.
- Production source: `/volume1/joinerflow-data`; runtime data: `/volume1/joinerflow`.
- Runtime containers: `joinerflow-server`, `joinerflow-client`, `joinerflow-clock-client`, `joinerflow-proxy`, and `joinerflow-postgres`; all were healthy during the check.
- Database mode: `DATABASE_DRIVER=sqlite` with `DATABASE_SHADOW_WRITE=true`; authoritative DB is `/volume1/joinerflow/server/joinerflow.sqlite`; PostgreSQL runs as staged shadow/future primary at `127.0.0.1:15432`.
- AI config: `OLLAMA_BASE_URL=http://192.168.1.40:11434` and `QDRANT_URL=http://192.168.1.40:6333`; from the NAS, the chunker on `192.168.1.40:8088` responded, while Ollama `11434` and Qdrant `6333` timed out during this check.
- User-facing routes: `crm.millbrookfurniture.co.nz`, `joinerflow.local`, `clock.joinerflow.local`, and compatibility `timeclock.millbrookfurniture.co.nz` through Caddy/DSM; Caddy maps `8080->80` and `8443->443`.

## App Will Not Start

Run:

```bash
npm run preflight:prod
```

Then check:

- `server/.env.local`
- `server/dist/index.js` exists
- `client/dist/index.html` exists
- `clock-client/dist/index.html` exists
- `SQLITE_PATH` directory is writable
- `FILESYSTEM_ROOT` is writable
- `PUBLIC_API_ORIGIN` is HTTPS and origin-only

## 502 Bad Gateway

Usually the reverse proxy cannot reach the API.

Check:

```bash
curl http://127.0.0.1:4000/health
sudo systemctl status joinerflow-api
```

Synology NAS:

```bash
sudo ./deployment/synology/scripts/check-health.sh
sudo /usr/local/bin/docker logs joinerflow-server --tail 200
```

## Login Fails

Check:

- Google client ID ends with `.apps.googleusercontent.com`
- Google Cloud Authorized JavaScript Origin matches `PUBLIC_API_ORIGIN`
- `AUTH_SESSION_SECRET` is configured
- system clock is correct
- HTTPS is working

## Time Clock Unavailable

Check:

- API is running on `4000`
- Time Clock app is running or published
- `TIMECLOCK_KIOSK_KEY` matches frontend build env when published separately
- local network access is from a trusted LAN/Tailscale device

## Files Do Not Open

Check:

- file is linked to the quote/job
- file exists under `FILESYSTEM_ROOT`
- file is not marked management/internal only
- reverse proxy forwards `/filesystem/*` and `/api/*`

## Documents Do Not Print Correctly

Check:

- browser print scaling is not forcing shrink/crop unexpectedly
- A3 is selected for handover packs/drawings
- generated PDF opens before printing
- quote list continuation pages are visible

## Imports Fail

Check:

- file type is supported
- file is below upload size limit
- imported rows are reviewed before confirm
- warnings are resolved or accepted intentionally

## Restore Needed

Follow [Backup & Recovery Guide](./backup-recovery-guide.md). Always create a safety backup before restore.
