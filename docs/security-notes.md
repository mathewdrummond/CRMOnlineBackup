# JoinerFlow Security Notes

## Current Infrastructure Stack

Updated from live production check on 2026-05-27.

- Active NAS/app host: Synology `Data` at `192.168.1.32`; `192.168.1.31` was not the active reachable host during this check.
- Production source: `/volume1/joinerflow-data`; runtime data: `/volume1/joinerflow`.
- Runtime containers: `joinerflow-server`, `joinerflow-client`, `joinerflow-clock-client`, `joinerflow-proxy`, and `joinerflow-postgres`; all were healthy during the check.
- Database mode: `DATABASE_DRIVER=sqlite` with `DATABASE_SHADOW_WRITE=true`; authoritative DB is `/volume1/joinerflow/server/joinerflow.sqlite`; PostgreSQL runs as staged shadow/future primary at `127.0.0.1:15432`.
- AI config: `OLLAMA_BASE_URL=http://192.168.1.40:11434` and `QDRANT_URL=http://192.168.1.40:6333`; from the NAS, the chunker on `192.168.1.40:8088` responded, while Ollama `11434` and Qdrant `6333` timed out during this check.
- User-facing routes: `crm.millbrookfurniture.co.nz`, `joinerflow.local`, `clock.joinerflow.local`, and compatibility `timeclock.millbrookfurniture.co.nz` through Caddy/DSM; Caddy maps `8080->80` and `8443->443`.

JoinerFlow is intended for a small workshop/business environment, but production data still needs strong protection.

## Authentication

- CRM access uses Google sign-in.
- Production requires `GOOGLE_CLIENT_ID`, `AUTH_SESSION_SECRET`, and a bootstrap admin or invited user.
- `ENABLE_TEST_AUTH` must not be enabled in production.
- Session secret must be at least 32 characters.
- Use HTTPS for live CRM access.

## Time Clock

- The standalone Time Clock uses `X-CRM-App: timeclock`.
- Production kiosk access should use `TIMECLOCK_KIOSK_KEY`.
- Time Clock may read only operational entities needed for staff clocking and production-safe handover data.

## File Access

File access is protected by:

- authenticated API session or approved local kiosk path
- entity read permission
- attachment linkage checks
- production visibility flags for Time Clock handover files
- path traversal checks
- MIME validation on upload
- `no-store`, `nosniff`, and sandbox headers on served files

Production staff should see only files linked to the active job/quote and visible to production.

## Uploads

Upload handling validates:

- file size
- file extension
- MIME type
- file signature where practical
- destination path containment

Do not add archive extraction or import restore code without explicit path traversal checks and staged extraction.

## Network Exposure

Recommended production pattern:

- Backend listens on `127.0.0.1:4000`.
- Caddy/nginx terminates HTTPS.
- Router exposes only `80/443` where required.
- Tailscale access should be limited to trusted devices/users.
- Do not expose SQLite, filesystem folders, or raw Node ports publicly.

## Environment Secrets

Keep out of source control:

- `AUTH_SESSION_SECRET`
- `TIMECLOCK_KIOSK_KEY`
- Google credentials
- production `.env.local`

Rotate secrets after a suspected leak.

## Production Checks

Run:

```bash
npm run preflight:prod
```

before go-live, after upgrades, and after restore.

