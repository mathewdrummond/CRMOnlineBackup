# Quick Start

## What You Get

This repository runs three local services together:

- CRM app on `http://127.0.0.1:5173`
- time clock app on `http://127.0.0.1:5174`
- API on `http://127.0.0.1:4000`

The API stores data locally in SQLite and stores attachments on the local filesystem.

## First Run

From the repo root:

```bash
npm install
npm run start:local
```

The launcher:

- verifies the local Node version, package scripts, workspaces, and installed dependencies
- clears stale managed processes after preflight passes
- starts the API, CRM, and time clock in the background
- waits until each service is ready
- writes runtime state to `.joinerflow-runtime/local-stack.json`
- writes per-service logs to `.joinerflow-runtime/logs/`

## Local URLs

- CRM: `http://127.0.0.1:5173`
- time clock: `http://127.0.0.1:5174`
- API: `http://127.0.0.1:4000`
- health: `http://127.0.0.1:4000/health`

## Stop The Stack

```bash
npm run stop:local
```

This stops the managed process tree, clears the local service ports, and leaves the launcher logs in place for troubleshooting.

## Environment Setup

Recommended local env files:

- copy `server/.env.example` to `server/.env.local`
- copy `client/.env.example` to `client/.env.local`
- copy `clock-client/.env.example` to `clock-client/.env.local` if you need a kiosk-enabled production time clock build

Important server settings:

- `GOOGLE_CLIENT_ID`
- `AUTH_SESSION_SECRET`
- `AUTH_BOOTSTRAP_ADMIN_EMAILS` for first-time setup when no invited users exist yet
- `TIMECLOCK_KIOSK_KEY` only when you want no-login kiosk access

After changing server env values, restart the API or rerun `npm run start:local`.

## Common Tasks

### Restart Everything

```bash
npm run stop:local
npm run start:local
```

### Build Release Assets

```bash
npm run build:release
```

### Run The Built API

```bash
npm run start:prod
```

### Validate Production Config Without Starting The API

```bash
npm run check:prod
```

### Run Automated Tests

```bash
npm test
```

## Reset Local Data

If you want a clean local database:

```bash
npm run stop:local
rm -f server/data/joinerflow.sqlite server/data/joinerflow.sqlite-wal server/data/joinerflow.sqlite-shm
npm run start:local
```

The API will recreate the local database and required system defaults on startup.

If you also want to clear uploaded files, remove `server/filesystem/` before restarting.

## Where Things Live

- database: `server/data/joinerflow.sqlite`
- attachments: `server/filesystem/`
- API logs: `server/logs/`
- launcher logs: `.joinerflow-runtime/logs/`
- local launcher state: `.joinerflow-runtime/local-stack.json`

## If Something Looks Wrong

Start with:

- `SYSTEM_VERIFICATION.md` for runtime checks
- `TESTING.md` for automated test commands
- `ARCHITECTURE.md` for the current system layout
- `deploy/DEPLOYMENT.md` for production hosting guidance
