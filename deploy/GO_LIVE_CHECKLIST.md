# Go-Live Checklist

## Build And Validation

- `npm install`
- `npm run build:release`
- `npm run check:prod`
- `npm test`
- `npm run smoke`

## Server Configuration

- `NODE_ENV=production`
- `HOST=127.0.0.1`
- `PORT=4000`
- `AUTH_SESSION_SECRET` is set to a strong secret
- `AUTH_SECURE_COOKIE=true`
- `TRUST_PROXY=true` when behind a reverse proxy
- `GOOGLE_CLIENT_ID` is configured and is the current production credential
- the Google Cloud OAuth app includes the exact production CRM origin such as `https://crm.example.com` as an Authorized JavaScript origin
- `PUBLIC_API_ORIGIN` is configured
- `ALLOWED_HOSTS` is configured
- `CORS_ORIGIN` is configured
- `SQLITE_PATH` is explicitly configured for production storage
- `FILESYSTEM_ROOT` is explicitly configured for production storage
- `ENABLE_TEST_AUTH` is not enabled in production

## Access Setup

- invited `AppUser` records exist, or `AUTH_BOOTSTRAP_ADMIN_EMAILS` is set for first-time bootstrap
- admin accounts have been confirmed on the live environment
- admin-only screens are verified as admin-only

## Time Clock Decision

- decide whether the standalone time clock is LAN-only or externally reachable
- if kiosk access is required, set `TIMECLOCK_KIOSK_KEY`
- if kiosk access is required, build the time clock with matching `VITE_TIMECLOCK_KIOSK_KEY`
- if the time clock is externally reachable, protect it with network restrictions in addition to the kiosk key where possible

## Network And Hosting

- reverse proxy or web server is serving the CRM static bundle
- reverse proxy or web server is serving the time clock bundle if used separately
- `/api/*` and `/filesystem/*` are proxied to the local API
- only `80` and `443` are exposed externally
- `4000` is not publicly exposed
- HTTPS is enabled for production CRM access

## Data And Backup

- `server/data/` exists on persistent storage
- `server/filesystem/` exists on persistent storage
- backup jobs are configured and tested
- restore instructions are documented for the host
- sufficient disk space exists for database, attachments, and logs

## Production Verification

- `/health` returns `200`
- CRM frontend loads through the intended production URL
- Google sign-in works from the production origin
- logout invalidates the session
- uploads block dangerous types
- attachment download works
- time clock loads and can reach the API
- audit and system health screens load for admins

## Final Sign-Off

- support owner knows where logs live
- support owner knows how to stop and start the production API
- support owner knows where backups are stored
- support owner has run through `SYSTEM_VERIFICATION.md` on the production-like environment
