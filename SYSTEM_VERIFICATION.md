# System Verification

This document is the current operator checklist for confirming that the local-first application is healthy.

## 1. Bring The Stack Up

From the repo root:

```bash
npm run start:local
```

Expected local endpoints:

- CRM: `http://127.0.0.1:5173`
- time clock: `http://127.0.0.1:5174`
- API: `http://127.0.0.1:4000`
- health: `http://127.0.0.1:4000/health`

## 2. Verify API Health

Open or curl:

```bash
curl http://127.0.0.1:4000/health
```

Expected response:

```json
{"status":"ok","mode":"offline-local"}
```

## 3. Verify The Frontends

Check:

- the CRM root page loads at `http://127.0.0.1:5173`
- the time clock loads at `http://127.0.0.1:5174`
- browser navigation does not show API connection warnings once the backend is healthy

## 4. Verify Local Storage Locations

Confirm these locations exist after startup:

- `server/data/joinerflow.sqlite`
- `server/filesystem/`
- `server/logs/`
- `.joinerflow-runtime/local-stack.json`
- `.joinerflow-runtime/logs/`

## 5. Verify Authentication Readiness

For CRM login environments:

- `server/.env.local` or `server/.env` contains `GOOGLE_CLIENT_ID`
- `server/.env.local` or `server/.env` contains `AUTH_SESSION_SECRET`
- either `AUTH_BOOTSTRAP_ADMIN_EMAILS` is set for first-time setup or invited `AppUser` records already exist

For kiosk time clock environments:

- `TIMECLOCK_KIOSK_KEY` is configured on the server only when no-login kiosk access is intended

## 6. Verify Support Logs

### Local Launcher Logs

- `.joinerflow-runtime/logs/api.log`
- `.joinerflow-runtime/logs/crm.log`
- `.joinerflow-runtime/logs/timeclock.log`

Use these when a local dev server fails to start or exits early.

### API Logs

- `server/logs/app.jsonl`
- `server/logs/security.jsonl`

Use these when the API is up but requests are failing, being rejected, or behaving unexpectedly.

## 7. Run Smoke And Test Checks

Fast server smoke:

```bash
npm run smoke
```

Full automated suite:

```bash
npm test
```

Useful targeted verification after recent runtime and validation changes:

```bash
npx vitest run client/src/api/localApiClient.test.js client/src/lib/moduleConfig.test.js server/src/api.test.ts
```

## 8. Validate Start And Stop Procedures

Confirm startup and shutdown are clean:

```bash
npm run stop:local
npm run start:local
npm run stop:local
```

Expected results:

- local ports `4000`, `5173`, and `5174` are cleared after shutdown
- `.joinerflow-runtime/local-stack.json` is removed after shutdown
- `.joinerflow-runtime/logs/` remains for diagnostics

## 9. Production Verification

Before starting the built API:

```bash
npm run build:release
npm run check:prod
```

If `check:prod` passes, start the built API:

```bash
npm run start:prod
```

Then verify:

- the reverse proxy serves the CRM static app
- `/health` returns `200`
- login works from the intended origin
- uploads and attachment downloads work
- admin-only screens remain admin-only

## 10. If Verification Fails

Start with this order:

1. Check `.joinerflow-runtime/logs/` for startup failures.
2. Check `server/logs/security.jsonl` for blocked host, origin, auth, or rate-limit events.
3. Check `server/logs/app.jsonl` for request IDs and server-side errors.
4. Re-run `npm run stop:local` and `npm run start:local`.
5. Re-run the targeted Vitest command above before making deeper runtime changes.
