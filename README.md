# JoinerFlow Local

This repository contains an offline-capable local version of the `mathewdrummond/joinerflow` app.

## Stack

- React + Vite frontend in `client/`
- Express API in `server/`
- Local SQLite database persisted at `server/data/joinerflow.sqlite`

## What Changed

- Removed the old hosted platform SDK runtime dependency from the app flow.
- Replaced CRM entity/auth calls with a local API client.
- Added a local SQLite-backed entity store with clean first-run bootstrap defaults instead of automatic demo seeding.
- Added tracked schema migrations plus automatic database/file-root initialization on startup.
- Removed runtime web dependencies like the remote CRM favicon and Google Fonts import.

## Local-First Data Storage

Core application data is stored locally in `server/data/joinerflow.sqlite`:

- customers: `Company` and `Contact`
- enquiries: `Lead`
- jobs: `Job`
- timesheets and clock attendance: `ClockIn` and `TimeEntry`
- notes: `Note`
- export history: `ExportHistory`

Associated local files are stored under `server/filesystem/`, and the server creates these directories automatically if they do not already exist:

- `server/filesystem/jobs`
- `server/filesystem/quotes`
- `server/filesystem/.versions`

Schema initialization is automatic on startup and tracked in the local `schema_migrations` table inside the SQLite file.

For the module, migration, row-version, workflow, startup, and UI component guardrails that protect
this local-first architecture, see `docs/architecture-hardening.md`.

## Module Architecture

Application modules are defined in `shared/moduleDefinitions.json`, enforced by `server/src/appModules.ts`, and persisted in the `AppModuleConfig` record inside SQLite.

Core modules stay locked on:

- Operations Shell
- Admin
- Staff
- Jobs
- Activities
- Timeclock

Optional modules can be toggled by admins:

- Dashboard
- Leads
- Contacts & Companies
- Quotes
- Millbrook Pricing Model
- Install Planner
- Suppliers
- MYOB Export
- Export History
- Manual Entry
- Reports

Dependency rules and generic entity ownership are stored in the module registry and enforced centrally by the rules engine in `server/src/appModules.ts`.

Required dependency matrix:

- Operations Shell: none
- Admin: none
- Staff: none
- Jobs: none
- Activities: Jobs, Staff
- Timeclock: Staff, Jobs, Activities
- Dashboard: Jobs, Activities, Timeclock
- Leads: Contacts & Companies
- Contacts & Companies: none
- Quotes: Contacts & Companies
- Millbrook Pricing Model: Quotes
- Install Planner: Jobs, Activities
- Suppliers: none
- MYOB Export: Timeclock
- Export History: MYOB Export
- Manual Entry: Timeclock
- Reports: Jobs, Activities, Timeclock

Optional integration matrix:

- Jobs enhances Install Planner and Millbrook Pricing Model
- Activities enhances Install Planner, Dashboard, and Reports
- Timeclock enhances MYOB Export, Export History, and Manual Entry
- Dashboard can surface Leads, Quotes, Install Planner, Pricing, and MYOB Export data when those modules are enabled
- Leads can integrate with Quotes
- Contacts & Companies can integrate with Leads, Quotes, and Pricing
- Suppliers can enhance supplier-linked pricing item lookups
- MYOB Export can integrate with Export History and Manual Entry
- Reports can incorporate Leads, Quotes, Pricing, and Install Planner data when available

Rules engine behaviour:

- Core modules cannot be disabled
- Enabling a module automatically enables any missing required dependencies
- Disabling a module automatically disables any enabled modules that require it
- Optional integrations never hard-block a module and only reduce related behaviour
- Invalid legacy or partial states are detected, reported, and normalized before they can break the app

Admins manage module state from the CRM Access page, and the state persists across reloads because it is stored in the local database.

## Run

```bash
cd /path/to/Millbrook-CRM
npm install
npm run start:local
```

This starts the local stack in the background, waits until each service is ready, then returns your terminal:

- CRM app: `http://127.0.0.1:5173`
- Time clock: `http://127.0.0.1:5174`
- API: `http://127.0.0.1:4000`
- Health: `http://127.0.0.1:4000/health`

Runtime metadata and launcher logs are written to `.joinerflow-runtime/`.
Stop the background stack with:

```bash
npm run stop:local
```

On Linux, use `./start-joinerflow.sh` and `./stop-joinerflow.sh`.

## Runtime Requirements

- Node.js `20.19.x` or `22.12+` through `26.x`
- npm on `PATH`
- For Linux local-dev startup, the launcher now falls back across `lsof`, `fuser`, `ss`, and `netstat`, which is friendlier to NAS-style distributions

## Production Build

```bash
npm run build:release
```

That builds:

- CRM static assets in `client/dist`
- time clock static assets in `clock-client/dist`
- API runtime in `server/dist`

The production API entrypoint is:

```bash
npm run start:prod
```

## Verify

- `npm run build`
- `http://localhost:4000/health`
- `npm run test --workspace=server -- src/persistence.test.ts`

## Testing

- `npm test` for unit and integration tests
- `npm run test:coverage` for coverage
- `npm run test:e2e` for browser clickthrough tests
- `npm run test:visual` for Playwright screenshot regression checks
- `npm run test:visual:update` to intentionally refresh approved UI baselines

More detail is in `TESTING.md` and `docs/visual-regression-testing.md`.

## Authentication

- Google sign-in uses the browser Google Identity credential flow plus server-side token verification.
- The frontend only receives `GOOGLE_CLIENT_ID` from the server config endpoint.
- No Google client secret or OAuth redirect URI is used by this flow.
- Keep real auth secrets in `server/.env.local`, not in tracked files.
- Use the current `GOOGLE_CLIENT_ID` as the production credential too.
- Set `GOOGLE_CLIENT_ID`, `AUTH_SESSION_SECRET`, and `PUBLIC_API_ORIGIN` for production CRM login.
- Register the exact production CRM origin, such as `https://crm.example.com`, as an Authorized JavaScript origin in Google Cloud. Do not include a path.
- Use `AUTH_BOOTSTRAP_ADMIN_EMAILS` only for the first login if no invited `AppUser` records exist yet.
- Restart the API after changing server auth env values so the runtime picks them up.
- Logout now invalidates the server-side session, not just the browser cookie.

## Production Security

- Review `SECURITY.md` before deployment.
- In production, set `AUTH_SESSION_SECRET` to a strong 32+ character value and enable secure cookies.
- In production, set `SQLITE_PATH` and `FILESYSTEM_ROOT` explicitly so the live install cannot reuse stale local runtime data by accident.
- If you want the no-login time clock in production, configure `TIMECLOCK_KIOSK_KEY` on the server and `VITE_TIMECLOCK_KIOSK_KEY` for the clock build.
- Uploaded files are now allowlisted and validated; blocked types like scripts, executables, SVG, and ZIP uploads are rejected.

## NAS Self-Hosting

The live Millbrook deployment now runs on the Synology NAS. Synology-specific install,
runtime, backup, and diagnostic scripts live under `deployment/synology/`.

## Deployment Guides

- General deployment: `deploy/DEPLOYMENT.md`
- Millbrook LAN access and certificates: `docs/millbrook-lan-access-and-certificates.md`
- Synology installation: `docs/synology-installation-guide.md`
- Synology troubleshooting: `docs/synology-troubleshooting.md`
- Security / live-use notes: `SECURITY.md`
- Backup and restore: `deploy/BACKUP_RESTORE.md`
- Go-live checklist: `deploy/GO_LIVE_CHECKLIST.md`
- Firewall / port exposure: `deploy/FIREWALL_PORTS.md`

## Reference Source

The original downloaded source is kept in `joinerflow-source/` for comparison and migration reference.
