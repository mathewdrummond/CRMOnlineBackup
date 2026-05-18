# Security And Production Notes

This app is hardened for production use, but it is not "set and forget". A safe deployment still depends on the hosting environment being configured responsibly.

## Application-Level Protections

- Signed `HttpOnly` auth cookies with `SameSite=Strict`
- Server-side session invalidation on logout
- Production secret strength checks for `AUTH_SESSION_SECRET`
- Mutation-origin checks using `Origin` / `Sec-Fetch-Site`
- Host header allowlisting via `ALLOWED_HOSTS`
- Basic rate limiting for global traffic, auth, and mutations
- Safer generic API errors with request IDs
- Upload allowlist validation by extension, MIME, and file signature
- Dangerous upload types blocked, including scriptable document types like `.svg`, `.html`, `.js`, `.exe`, `.bat`, `.ps1`, and `.zip`
- Files served with `nosniff`, restrictive CSP, and inline-vs-attachment content disposition
- Audit logging for entity writes plus security event logging for blocked hosts, origins, and rate limits

## Production Environment Variables

Set these in `server/.env.local` or your deployment secret store:

```bash
NODE_ENV=production
AUTH_SESSION_SECRET=<32+ character secret>
AUTH_SESSION_TTL_HOURS=12
AUTH_SECURE_COOKIE=true
TRUST_PROXY=true
PUBLIC_API_ORIGIN=https://your-domain.example
ALLOWED_HOSTS=your-domain.example
CORS_ORIGIN=https://your-domain.example
TIMECLOCK_KIOSK_KEY=<random kiosk key for no-login timeclock access>
GOOGLE_CLIENT_ID=<google client id>
AUTH_BOOTSTRAP_ADMIN_EMAILS=owner@example.com
```

For direct LAN-only hosting without a reverse proxy, you can bind the API with `HOST=0.0.0.0`, but the safer production default is to keep the API on `127.0.0.1` and expose only Nginx or Caddy.

For the time clock frontend, set this in `clock-client/.env.local` before building:

```bash
VITE_TIMECLOCK_KIOSK_KEY=<same value as TIMECLOCK_KIOSK_KEY>
```

## Kiosk Deployment

The time clock still supports a no-login kiosk flow.

- In development, the server allows time clock traffic from the local network.
- In production, no-login kiosk API access is only enabled when `TIMECLOCK_KIOSK_KEY` is configured.
- Treat the time clock as an internal tool: keep it behind LAN, VPN, or reverse-proxy access controls instead of exposing it openly to the public internet.

## Infrastructure Still Required

These controls sit outside the app and still need to be done by the host/reverse proxy:

- HTTPS termination with HSTS-capable reverse proxy
- Firewall or reverse-proxy restriction for the time clock
- Regular backups of `server/data` and `server/filesystem`
- OS patching, anti-malware, and disk protection on the host
- Log shipping / monitoring for `server/logs/*.jsonl`
- Secret management outside git-tracked files
- Optional malware scanning for uploaded files before they are backed up or synced elsewhere

## Recommended Backup Scope

Back up all of:

- `server/data/joinerflow.sqlite`
- `server/data/joinerflow.sqlite-wal`
- `server/data/joinerflow.sqlite-shm`
- `server/filesystem`
- `server/logs`

Backups should be versioned, offline/immutable where possible, and tested with restore drills.
