# Start Here

This is the current local-first Millbrook CRM / JoinerFlow codebase.

If you only need the app running:

```bash
npm install
npm run start:local
```

Open:

- CRM: `http://127.0.0.1:5173`
- time clock: `http://127.0.0.1:5174`
- API health: `http://127.0.0.1:4000/health`

Stop the stack with:

```bash
npm run stop:local
```

## Read Next

- `QUICKSTART.md`
  Fast local setup, env files, restart, reset, and common commands.
- `ARCHITECTURE.md`
  Current runtime layout, storage model, module system, auth, and deployment assumptions.
- `SYSTEM_VERIFICATION.md`
  Operator checks for startup, health, logs, storage, and smoke testing.
- `TESTING.md`
  Automated test commands and targeted suites.
- `deploy/DEPLOYMENT.md`
  Production build and hosting guidance.
- `SECURITY.md`
  Production hardening notes and environment requirements.

## Current Runtime Model

The repo is a monorepo with:

- CRM frontend in `client/`
- time clock frontend in `clock-client/`
- Express API in `server/`
- SQLite data in `server/data/`
- attachments in `server/filesystem/`

If you see older docs mentioning Prisma routes, Axios, a Kanban-only CRM prototype, or `/Users/drummond/Desktop/CRM`, those notes are from the earlier prototype and should not be used for current setup or support.
